-- Migration: Hypergraph entity model
-- Replaces workspace_items (flat tree) with:
--   entities          — generic base node
--   artworks          — artwork subtype (entity_id PK)
--   collection_nodes  — collection subtype (entity_id PK)
--   entity_relations  — typed semantic edges (replaces parentId + artwork_relations)
--   workspaces        — org-scoped workspaces
--
-- FK tables (artwork_jobs, artwork_access, etc.) are recreated to point to entities(id).
-- Data integrity: all UUIDs are preserved — no data loss.

PRAGMA foreign_keys = OFF;
--> statement-breakpoint

-- ── 1. Create workspaces ──────────────────────────────────────────────────────
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text,
	`visibility` text DEFAULT 'private' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_slug_unique` ON `workspaces` (`slug`);
--> statement-breakpoint
CREATE INDEX `idx_workspaces_org` ON `workspaces` (`org_id`);
--> statement-breakpoint

-- ── 2. Create entities (base node) ───────────────────────────────────────────
CREATE TABLE `entities` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`workspace_id` text,
	`created_by` text NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_entities_created_by_type` ON `entities` (`created_by`, `type`);
--> statement-breakpoint
CREATE INDEX `idx_entities_workspace_type` ON `entities` (`workspace_id`, `type`);
--> statement-breakpoint
CREATE INDEX `idx_entities_visibility` ON `entities` (`visibility`);
--> statement-breakpoint

-- ── 3. Populate entities from workspace_items ─────────────────────────────────
INSERT INTO `entities` (`id`, `type`, `workspace_id`, `created_by`, `visibility`, `created_at`, `updated_at`)
SELECT `id`, `kind`, NULL, `user_id`, `visibility`, `created_at`, `updated_at`
FROM `workspace_items`;
--> statement-breakpoint

-- ── 3b. Drop old artworks table (integer PK, migrated to workspace_items in 0019) ─
DROP TABLE IF EXISTS `artworks`;
--> statement-breakpoint

-- ── 4. Create artworks subtype (DB table: artworks) ───────────────────────────
CREATE TABLE `artworks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`r2_key` text,
	`url` text,
	`width` integer,
	`height` integer,
	`protection_status` text DEFAULT 'idle',
	`job_id` text,
	`method` text DEFAULT 'shield',
	`metadata` text,
	`size` integer,
	`semantic_type` text DEFAULT 'digital_art',
	FOREIGN KEY (`id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_artworks_status` ON `artworks` (`protection_status`);
--> statement-breakpoint
CREATE INDEX `idx_artworks_job` ON `artworks` (`job_id`);
--> statement-breakpoint

-- ── 5. Populate artworks subtype from workspace_items ─────────────────────────
INSERT INTO `artworks` (
	`id`, `title`, `description`, `r2_key`, `url`,
	`width`, `height`, `protection_status`, `job_id`, `method`,
	`metadata`, `size`, `semantic_type`
)
SELECT
	`id`, `title`, `description`, `r2_key`, `url`,
	`width`, `height`,
	LOWER(COALESCE(`protection_status`, 'idle')),
	`job_id`, COALESCE(`method`, 'shield'),
	`metadata`, `size`, COALESCE(`semantic_type`, 'digital_art')
FROM `workspace_items`
WHERE `kind` = 'artwork';
--> statement-breakpoint

-- ── 6. Create collection_nodes subtype ───────────────────────────────────────
CREATE TABLE `collection_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`cover_image_url` text,
	`item_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_collection_nodes_name` ON `collection_nodes` (`name`);
--> statement-breakpoint

-- ── 7. Populate collection_nodes from workspace_items ─────────────────────────
INSERT INTO `collection_nodes` (`id`, `name`, `description`, `item_count`)
SELECT `id`, `title`, `description`, COALESCE(`item_count`, 0)
FROM `workspace_items`
WHERE `kind` = 'collection';
--> statement-breakpoint

-- ── 8. Create entity_relations ────────────────────────────────────────────────
CREATE TABLE `entity_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	`type` text NOT NULL,
	`position` real,
	`metadata` text,
	`created_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`from_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entity_relations_unique` ON `entity_relations` (`from_id`, `to_id`, `type`);
--> statement-breakpoint
CREATE INDEX `idx_entity_relations_from_type_pos` ON `entity_relations` (`from_id`, `type`, `position`);
--> statement-breakpoint
CREATE INDEX `idx_entity_relations_to_type` ON `entity_relations` (`to_id`, `type`);
--> statement-breakpoint
CREATE INDEX `idx_entity_relations_type` ON `entity_relations` (`type`);
--> statement-breakpoint

-- ── 9. Populate entity_relations from workspace_items.parent_id ───────────────
-- parent --[contains]--> child
INSERT INTO `entity_relations` (`id`, `from_id`, `to_id`, `type`, `position`, `created_by`, `created_at`)
SELECT
	lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
	`parent_id`,
	`id`,
	'contains',
	CAST(`position` AS REAL),
	`user_id`,
	`created_at`
FROM `workspace_items`
WHERE `parent_id` IS NOT NULL;
--> statement-breakpoint

-- ── 10. Migrate artwork_relations → entity_relations ──────────────────────────
INSERT OR IGNORE INTO `entity_relations` (`id`, `from_id`, `to_id`, `type`, `metadata`, `created_by`, `created_at`)
SELECT
	lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
	`source_artwork_id`,
	`target_artwork_id`,
	`relation_type`,
	`reference_metadata`,
	`created_by_user_id`,
	`created_at`
FROM `artwork_relations`;
--> statement-breakpoint

-- ── 11. Recreate artwork_jobs with FK to entities.id ─────────────────────────
CREATE TABLE `artwork_jobs_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`artwork_id` text NOT NULL,
	`external_id` text,
	`method` text NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`step_order` integer NOT NULL,
	`input_url` text NOT NULL,
	`output_url` text,
	`output_key` text,
	`current_step` text,
	`result` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`error_message` text,
	`meta` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`artwork_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `artwork_jobs_new` SELECT * FROM `artwork_jobs`;
--> statement-breakpoint
DROP TABLE `artwork_jobs`;
--> statement-breakpoint
ALTER TABLE `artwork_jobs_new` RENAME TO `artwork_jobs`;
--> statement-breakpoint
CREATE INDEX `idx_jobs_artwork_id` ON `artwork_jobs` (`artwork_id`);
--> statement-breakpoint
CREATE INDEX `idx_jobs_status` ON `artwork_jobs` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_jobs_external_id` ON `artwork_jobs` (`external_id`);
--> statement-breakpoint

-- ── 12. Recreate FK tables with updated references to entities.id ─────────────

-- artwork_access
CREATE TABLE `artwork_access_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`artwork_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`source_type` text DEFAULT 'direct' NOT NULL,
	`source_id` text,
	`granted_by_user_id` text,
	`expires_at` text,
	`granted_at` text NOT NULL,
	FOREIGN KEY (`artwork_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
INSERT INTO `artwork_access_new` SELECT * FROM `artwork_access`;
DROP TABLE `artwork_access`;
ALTER TABLE `artwork_access_new` RENAME TO `artwork_access`;
CREATE UNIQUE INDEX `artwork_access_unique` ON `artwork_access` (`artwork_id`, `user_id`);
CREATE INDEX `idx_artwork_access_artwork` ON `artwork_access` (`artwork_id`);
CREATE INDEX `idx_artwork_access_user` ON `artwork_access` (`user_id`);
CREATE INDEX `idx_artwork_access_source` ON `artwork_access` (`source_type`, `source_id`);
--> statement-breakpoint

-- artwork_credits
CREATE TABLE `artwork_credits_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`artwork_id` text NOT NULL,
	`user_id` text,
	`external_name` text,
	`external_url` text,
	`role` text DEFAULT 'collaborator' NOT NULL,
	`note` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`is_public` integer DEFAULT true NOT NULL,
	`added_at` text NOT NULL,
	FOREIGN KEY (`artwork_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
INSERT INTO `artwork_credits_new` SELECT * FROM `artwork_credits`;
DROP TABLE `artwork_credits`;
ALTER TABLE `artwork_credits_new` RENAME TO `artwork_credits`;
CREATE UNIQUE INDEX `artwork_credits_user_role_unique` ON `artwork_credits` (`artwork_id`, `user_id`, `role`);
CREATE INDEX `idx_artwork_credits_artwork` ON `artwork_credits` (`artwork_id`);
CREATE INDEX `idx_artwork_credits_user` ON `artwork_credits` (`user_id`);
--> statement-breakpoint

-- artwork_snapshots
CREATE TABLE `artwork_snapshots_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`artwork_id` text NOT NULL,
	`previous_snapshot_id` integer,
	`reason` text DEFAULT 'manual' NOT NULL,
	`snapshot_data` text NOT NULL,
	`label` text,
	`created_by_user_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`artwork_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
INSERT INTO `artwork_snapshots_new` SELECT * FROM `artwork_snapshots`;
DROP TABLE `artwork_snapshots`;
ALTER TABLE `artwork_snapshots_new` RENAME TO `artwork_snapshots`;
CREATE INDEX `idx_artwork_snapshots_artwork` ON `artwork_snapshots` (`artwork_id`);
CREATE INDEX `idx_artwork_snapshots_created` ON `artwork_snapshots` (`artwork_id`, `created_at`);
--> statement-breakpoint

-- artwork_files
CREATE TABLE `artwork_files_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`artwork_id` text NOT NULL,
	`role` text DEFAULT 'primary' NOT NULL,
	`format` text DEFAULT 'image' NOT NULL,
	`r2_key` text NOT NULL,
	`url` text NOT NULL,
	`filename` text,
	`mime_type` text,
	`size_bytes` integer,
	`width` integer,
	`height` integer,
	`duration_ms` integer,
	`cf_image_id` text,
	`cf_stream_id` text,
	`sha256` text,
	`uploaded_by_user_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`artwork_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
INSERT INTO `artwork_files_new` SELECT * FROM `artwork_files`;
DROP TABLE `artwork_files`;
ALTER TABLE `artwork_files_new` RENAME TO `artwork_files`;
CREATE INDEX `idx_artwork_files_artwork_id` ON `artwork_files` (`artwork_id`);
CREATE INDEX `idx_artwork_files_role` ON `artwork_files` (`artwork_id`, `role`);
CREATE UNIQUE INDEX `artwork_files_r2_key_unique` ON `artwork_files` (`r2_key`);
--> statement-breakpoint

-- artwork_artists
CREATE TABLE `artwork_artists_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`artwork_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'creator' NOT NULL,
	`note` text,
	`added_at` text NOT NULL,
	FOREIGN KEY (`artwork_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
INSERT INTO `artwork_artists_new` SELECT * FROM `artwork_artists`;
DROP TABLE `artwork_artists`;
ALTER TABLE `artwork_artists_new` RENAME TO `artwork_artists`;
CREATE UNIQUE INDEX `uq_artwork_artist_role` ON `artwork_artists` (`artwork_id`, `user_id`, `role`);
CREATE INDEX `idx_artwork_artists_artwork_id` ON `artwork_artists` (`artwork_id`);
CREATE INDEX `idx_artwork_artists_user_id` ON `artwork_artists` (`user_id`);
CREATE INDEX `idx_artwork_artists_role` ON `artwork_artists` (`role`);
--> statement-breakpoint

-- portfolio_artworks
CREATE TABLE `portfolio_artworks_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`artwork_id` text NOT NULL,
	`is_featured` integer DEFAULT false NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`added_at` text NOT NULL,
	`added_by_user_id` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artwork_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
INSERT INTO `portfolio_artworks_new` SELECT * FROM `portfolio_artworks`;
DROP TABLE `portfolio_artworks`;
ALTER TABLE `portfolio_artworks_new` RENAME TO `portfolio_artworks`;
CREATE UNIQUE INDEX `portfolio_artworks_org_artwork_unique` ON `portfolio_artworks` (`organization_id`, `artwork_id`);
CREATE INDEX `idx_portfolio_artworks_org_featured` ON `portfolio_artworks` (`organization_id`, `is_featured`);
CREATE INDEX `idx_portfolio_artworks_artwork_id` ON `portfolio_artworks` (`artwork_id`);
--> statement-breakpoint

-- collection_items (social) — update artwork_id FK
CREATE TABLE `collection_items_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`collection_id` text NOT NULL,
	`artwork_id` text,
	`external_url` text,
	`external_title` text,
	`external_image_url` text,
	`note` text,
	`position` integer DEFAULT 0 NOT NULL,
	`added_by_user_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artwork_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
INSERT INTO `collection_items_new` SELECT * FROM `collection_items`;
DROP TABLE `collection_items`;
ALTER TABLE `collection_items_new` RENAME TO `collection_items`;
CREATE UNIQUE INDEX `collection_items_coll_artwork_unique` ON `collection_items` (`collection_id`, `artwork_id`);
CREATE INDEX `idx_collection_items_coll_position` ON `collection_items` (`collection_id`, `position`);
CREATE INDEX `idx_collection_items_artwork` ON `collection_items` (`artwork_id`);
--> statement-breakpoint

-- commission_reference_artworks
CREATE TABLE `commission_reference_artworks_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`commission_id` text NOT NULL,
	`artwork_id` text,
	`external_url` text,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`commission_id`) REFERENCES `commissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artwork_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE set null
);
INSERT INTO `commission_reference_artworks_new` SELECT * FROM `commission_reference_artworks`;
DROP TABLE `commission_reference_artworks`;
ALTER TABLE `commission_reference_artworks_new` RENAME TO `commission_reference_artworks`;
CREATE INDEX `idx_commission_refs_commission_id` ON `commission_reference_artworks` (`commission_id`);
--> statement-breakpoint

-- ── 13. Drop superseded tables ────────────────────────────────────────────────
DROP TABLE IF EXISTS `workspace_items`;
--> statement-breakpoint
DROP TABLE IF EXISTS `artwork_relations`;
--> statement-breakpoint

PRAGMA foreign_keys = ON;
