-- Migration 0021: Universal Nodes + Two-Layer Identity
--
-- Promotes the graph to a truly universal model:
--   1. `nodes` replaces `entities` (same data, same column names, wider type set)
--   2. `node_relations` replaces `entity_relations` (adds `slot` discriminator)
--   3. `profile_nodes` links better-auth organizations into the graph
--   4. Social collections (collections, collection_members, collection_items,
--      collection_placements) unified into collection_nodes + node_relations
--   5. artwork_artists, portfolio_artworks, profile_follows → node_relations
--   6. artwork_access renamed to node_access (covers any node type)
--
-- PRAGMA foreign_keys = OFF for the duration — we recreate FK tables.

PRAGMA foreign_keys = OFF;

-- ── 1. Create `nodes` (same structure as `entities`, wider type set) ──────────

CREATE TABLE IF NOT EXISTS `nodes` (
    `id` text PRIMARY KEY NOT NULL,
    `type` text NOT NULL,
    `created_by` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
    `workspace_id` text,
    `visibility` text NOT NULL DEFAULT 'private',
    `created_at` text NOT NULL,
    `updated_at` text NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_nodes_created_by_type` ON `nodes` (`created_by`, `type`);
CREATE INDEX IF NOT EXISTS `idx_nodes_workspace_type` ON `nodes` (`workspace_id`, `type`);
CREATE INDEX IF NOT EXISTS `idx_nodes_visibility` ON `nodes` (`visibility`);
CREATE INDEX IF NOT EXISTS `idx_nodes_type` ON `nodes` (`type`);

-- Populate from entities (artwork + collection nodes)
INSERT OR IGNORE INTO `nodes` (`id`, `type`, `created_by`, `workspace_id`, `visibility`, `created_at`, `updated_at`)
SELECT `id`, `type`, `created_by`, `workspace_id`, `visibility`, `created_at`, `updated_at`
FROM `entities`;

-- ── 2. Create profile_nodes (1:1 with better-auth organization) ──────────────

-- First, ensure every org has a corresponding node row
INSERT OR IGNORE INTO `nodes` (`id`, `type`, `created_by`, `workspace_id`, `visibility`, `created_at`, `updated_at`)
SELECT
    o.`id`,
    'profile',
    COALESCE(
        (SELECT m.`user_id` FROM `member` m WHERE m.`organization_id` = o.`id` AND m.`role` = 'owner' LIMIT 1),
        (SELECT m.`user_id` FROM `member` m WHERE m.`organization_id` = o.`id` LIMIT 1),
        -- Fallback: use any existing user (shouldn't happen in practice)
        (SELECT `id` FROM `user` LIMIT 1)
    ),
    NULL,
    COALESCE(o.`visibility`, 'public'),
    datetime('now'),
    datetime('now')
FROM `organization` o;

CREATE TABLE IF NOT EXISTS `profile_nodes` (
    `id` text PRIMARY KEY NOT NULL REFERENCES `nodes`(`id`) ON DELETE CASCADE,
    `org_id` text NOT NULL REFERENCES `organization`(`id`) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS `profile_nodes_org_id_unique` ON `profile_nodes` (`org_id`);
CREATE INDEX IF NOT EXISTS `idx_profile_nodes_org_id` ON `profile_nodes` (`org_id`);

INSERT OR IGNORE INTO `profile_nodes` (`id`, `org_id`)
SELECT `id`, `id` FROM `organization`;

-- ── 3. Create `node_relations` (entity_relations + slot discriminator) ────────

CREATE TABLE IF NOT EXISTS `node_relations` (
    `id` text PRIMARY KEY NOT NULL,
    `from_id` text NOT NULL REFERENCES `nodes`(`id`) ON DELETE CASCADE,
    `to_id` text NOT NULL REFERENCES `nodes`(`id`) ON DELETE CASCADE,
    `type` text NOT NULL,
    `position` real,
    `slot` text NOT NULL DEFAULT '',
    `metadata` text,
    `created_by` text REFERENCES `user`(`id`) ON DELETE SET NULL,
    `created_at` text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `node_relations_unique` ON `node_relations` (`from_id`, `to_id`, `type`, `slot`);
CREATE INDEX IF NOT EXISTS `idx_node_relations_from_type_pos` ON `node_relations` (`from_id`, `type`, `position`);
CREATE INDEX IF NOT EXISTS `idx_node_relations_to_type` ON `node_relations` (`to_id`, `type`);
CREATE INDEX IF NOT EXISTS `idx_node_relations_type` ON `node_relations` (`type`);

-- Populate from entity_relations (all existing structural/provenance/semantic edges)
INSERT OR IGNORE INTO `node_relations` (`id`, `from_id`, `to_id`, `type`, `position`, `slot`, `metadata`, `created_by`, `created_at`)
SELECT `id`, `from_id`, `to_id`, `type`, `position`, '', `metadata`, `created_by`, `created_at`
FROM `entity_relations`;

-- ── 4. Migrate social collections → collection_nodes ─────────────────────────

-- Add social collection data as graph nodes (same id as collections.id)
INSERT OR IGNORE INTO `nodes` (`id`, `type`, `created_by`, `workspace_id`, `visibility`, `created_at`, `updated_at`)
SELECT
    `id`,
    'collection',
    `created_by_user_id`,
    NULL,
    `visibility`,
    `created_at`,
    `updated_at`
FROM `collections`;

INSERT OR IGNORE INTO `collection_nodes` (`id`, `name`, `description`, `cover_image_url`, `item_count`)
SELECT
    `id`,
    `title`,
    `description`,
    COALESCE(`cover_url`, `cover_r2_key`),
    `item_count`
FROM `collections`;

-- Migrate collection_items → node_relations (contains)
INSERT OR IGNORE INTO `node_relations` (`id`, `from_id`, `to_id`, `type`, `position`, `slot`, `metadata`, `created_by`, `created_at`)
SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
    `collection_id`,
    `artwork_id`,
    'contains',
    CAST(`position` AS REAL),
    '',
    NULL,
    `added_by_user_id`,
    `created_at`
FROM `collection_items`
WHERE `artwork_id` IS NOT NULL;

-- Migrate collection_members → node_relations (member_of, from profile_node)
-- Maps user → their first profile (org) then inserts the edge
INSERT OR IGNORE INTO `node_relations` (`id`, `from_id`, `to_id`, `type`, `slot`, `metadata`, `created_by`, `created_at`)
SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
    pn.`id`,
    cm.`collection_id`,
    'member_of',
    '',
    json_object('role', cm.`role`, 'source_type', cm.`source_type`),
    cm.`granted_by_user_id`,
    cm.`granted_at`
FROM `collection_members` cm
JOIN `member` m ON m.`user_id` = cm.`user_id`
JOIN `profile_nodes` pn ON pn.`org_id` = m.`organization_id`
WHERE pn.`id` IS NOT NULL;

-- ── 5. Migrate artwork_artists → node_relations ───────────────────────────────
-- Maps role names: CREATOR→creates, COLLABORATOR→collaborates, etc.

INSERT OR IGNORE INTO `node_relations` (`id`, `from_id`, `to_id`, `type`, `slot`, `metadata`, `created_by`, `created_at`)
SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
    pn.`id`,
    aa.`artwork_id`,
    CASE aa.`role`
        WHEN 'creator'      THEN 'creates'
        WHEN 'collaborator' THEN 'collaborates'
        WHEN 'commissioner' THEN 'commissioned'
        WHEN 'subject'      THEN 'subjects'
        WHEN 'curator'      THEN 'curates'
        ELSE aa.`role`
    END,
    '',
    CASE WHEN aa.`note` IS NOT NULL THEN json_object('note', aa.`note`) ELSE NULL END,
    NULL,
    aa.`added_at`
FROM `artwork_artists` aa
JOIN `member` m ON m.`user_id` = aa.`user_id`
JOIN `profile_nodes` pn ON pn.`org_id` = m.`organization_id`
WHERE pn.`id` IS NOT NULL;

-- ── 6. Migrate portfolio_artworks → node_relations (features) ─────────────────

INSERT OR IGNORE INTO `node_relations` (`id`, `from_id`, `to_id`, `type`, `slot`, `metadata`, `created_by`, `created_at`)
SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
    pn.`id`,
    pa.`artwork_id`,
    'features',
    '',
    json_object('display_order', pa.`display_order`, 'is_featured', pa.`is_featured`),
    pa.`added_by_user_id`,
    pa.`added_at`
FROM `portfolio_artworks` pa
JOIN `profile_nodes` pn ON pn.`org_id` = pa.`organization_id`
WHERE pn.`id` IS NOT NULL;

-- ── 7. Migrate profile_follows → node_relations (follows) ────────────────────

INSERT OR IGNORE INTO `node_relations` (`id`, `from_id`, `to_id`, `type`, `slot`, `created_by`, `created_at`)
SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
    pn.`id`,
    (SELECT pn2.`id` FROM `profile_nodes` pn2 WHERE pn2.`org_id` = pf.`following_organization_id`),
    'follows',
    '',
    pf.`follower_user_id`,
    pf.`created_at`
FROM `profile_follows` pf
JOIN `member` m ON m.`user_id` = pf.`follower_user_id`
JOIN `profile_nodes` pn ON pn.`org_id` = m.`organization_id`
WHERE (SELECT pn2.`id` FROM `profile_nodes` pn2 WHERE pn2.`org_id` = pf.`following_organization_id`) IS NOT NULL;

-- ── 8. Create node_access (replaces artwork_access) ──────────────────────────

CREATE TABLE IF NOT EXISTS `node_access` (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `node_id` text NOT NULL REFERENCES `nodes`(`id`) ON DELETE CASCADE,
    `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
    `role` text NOT NULL DEFAULT 'viewer',
    `source_type` text NOT NULL DEFAULT 'direct',
    `source_id` text,
    `granted_by_user_id` text REFERENCES `user`(`id`) ON DELETE SET NULL,
    `expires_at` text,
    `granted_at` text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `node_access_unique` ON `node_access` (`node_id`, `user_id`);
CREATE INDEX IF NOT EXISTS `idx_node_access_node` ON `node_access` (`node_id`);
CREATE INDEX IF NOT EXISTS `idx_node_access_user` ON `node_access` (`user_id`);
CREATE INDEX IF NOT EXISTS `idx_node_access_source` ON `node_access` (`source_type`, `source_id`);

INSERT OR IGNORE INTO `node_access` (`id`, `node_id`, `user_id`, `role`, `source_type`, `source_id`, `granted_by_user_id`, `expires_at`, `granted_at`)
SELECT `id`, `artwork_id`, `user_id`, `role`, `source_type`, `source_id`, `granted_by_user_id`, `expires_at`, `granted_at`
FROM `artwork_access`;

-- ── 9. Recreate satellite FK tables pointing to nodes.id ─────────────────────

-- artwork_jobs
CREATE TABLE `artwork_jobs_new` (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `artwork_id` text NOT NULL REFERENCES `nodes`(`id`) ON DELETE CASCADE,
    `external_id` text,
    `method` text NOT NULL,
    `config` text NOT NULL DEFAULT '{}',
    `step_order` integer NOT NULL,
    `input_url` text NOT NULL,
    `output_url` text,
    `output_key` text,
    `current_step` text,
    `result` text,
    `status` text NOT NULL DEFAULT 'pending',
    `error_message` text,
    `meta` text,
    `created_at` text NOT NULL,
    `updated_at` text NOT NULL
);
INSERT INTO `artwork_jobs_new` SELECT * FROM `artwork_jobs`;
DROP TABLE `artwork_jobs`;
ALTER TABLE `artwork_jobs_new` RENAME TO `artwork_jobs`;
CREATE INDEX IF NOT EXISTS `idx_jobs_artwork_id` ON `artwork_jobs` (`artwork_id`);
CREATE INDEX IF NOT EXISTS `idx_jobs_status` ON `artwork_jobs` (`status`);
CREATE INDEX IF NOT EXISTS `idx_jobs_external_id` ON `artwork_jobs` (`external_id`);

-- artwork_snapshots
CREATE TABLE `artwork_snapshots_new` (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `artwork_id` text NOT NULL REFERENCES `nodes`(`id`) ON DELETE CASCADE,
    `previous_snapshot_id` integer,
    `reason` text NOT NULL DEFAULT 'manual',
    `snapshot_data` text NOT NULL,
    `label` text,
    `created_by_user_id` text REFERENCES `user`(`id`) ON DELETE SET NULL,
    `created_at` text NOT NULL
);
INSERT INTO `artwork_snapshots_new` SELECT * FROM `artwork_snapshots`;
DROP TABLE `artwork_snapshots`;
ALTER TABLE `artwork_snapshots_new` RENAME TO `artwork_snapshots`;
CREATE INDEX IF NOT EXISTS `idx_artwork_snapshots_artwork` ON `artwork_snapshots` (`artwork_id`);
CREATE INDEX IF NOT EXISTS `idx_artwork_snapshots_created` ON `artwork_snapshots` (`artwork_id`, `created_at`);

-- artwork_credits
CREATE TABLE `artwork_credits_new` (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `artwork_id` text NOT NULL REFERENCES `nodes`(`id`) ON DELETE CASCADE,
    `user_id` text REFERENCES `user`(`id`) ON DELETE SET NULL,
    `external_name` text,
    `external_url` text,
    `role` text NOT NULL DEFAULT 'collaborator',
    `note` text,
    `display_order` integer NOT NULL DEFAULT 0,
    `is_public` integer NOT NULL DEFAULT 1,
    `added_at` text NOT NULL
);
INSERT INTO `artwork_credits_new` SELECT * FROM `artwork_credits`;
DROP TABLE `artwork_credits`;
ALTER TABLE `artwork_credits_new` RENAME TO `artwork_credits`;
CREATE UNIQUE INDEX IF NOT EXISTS `artwork_credits_user_role_unique` ON `artwork_credits` (`artwork_id`, `user_id`, `role`);
CREATE INDEX IF NOT EXISTS `idx_artwork_credits_artwork` ON `artwork_credits` (`artwork_id`);
CREATE INDEX IF NOT EXISTS `idx_artwork_credits_user` ON `artwork_credits` (`user_id`);

-- artwork_files
CREATE TABLE `artwork_files_new` (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `artwork_id` text NOT NULL REFERENCES `nodes`(`id`) ON DELETE CASCADE,
    `role` text NOT NULL DEFAULT 'primary',
    `format` text NOT NULL DEFAULT 'image',
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
    `uploaded_by_user_id` text REFERENCES `user`(`id`) ON DELETE SET NULL,
    `created_at` text NOT NULL
);
INSERT INTO `artwork_files_new` SELECT * FROM `artwork_files`;
DROP TABLE `artwork_files`;
ALTER TABLE `artwork_files_new` RENAME TO `artwork_files`;
CREATE INDEX IF NOT EXISTS `idx_artwork_files_artwork_id` ON `artwork_files` (`artwork_id`);
CREATE INDEX IF NOT EXISTS `idx_artwork_files_role` ON `artwork_files` (`artwork_id`, `role`);
CREATE UNIQUE INDEX IF NOT EXISTS `artwork_files_r2_key_unique` ON `artwork_files` (`r2_key`);

-- commission_reference_artworks
CREATE TABLE `commission_reference_artworks_new` (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `commission_id` text NOT NULL REFERENCES `commissions`(`id`) ON DELETE CASCADE,
    `artwork_id` text REFERENCES `nodes`(`id`) ON DELETE SET NULL,
    `external_url` text,
    `note` text,
    `added_at` text NOT NULL
);
INSERT INTO `commission_reference_artworks_new` SELECT * FROM `commission_reference_artworks`;
DROP TABLE `commission_reference_artworks`;
ALTER TABLE `commission_reference_artworks_new` RENAME TO `commission_reference_artworks`;
CREATE INDEX IF NOT EXISTS `idx_commission_ref_commission` ON `commission_reference_artworks` (`commission_id`);
CREATE INDEX IF NOT EXISTS `idx_commission_ref_artwork` ON `commission_reference_artworks` (`artwork_id`);

-- artworks (subtype) — FK was already pointing to entities.id (same column name)
CREATE TABLE `artworks_new` (
    `id` text PRIMARY KEY NOT NULL REFERENCES `nodes`(`id`) ON DELETE CASCADE,
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
    `semantic_type` text DEFAULT 'digital_art'
);
INSERT INTO `artworks_new` SELECT * FROM `artworks`;
DROP TABLE `artworks`;
ALTER TABLE `artworks_new` RENAME TO `artworks`;
CREATE INDEX IF NOT EXISTS `idx_artworks_status` ON `artworks` (`protection_status`);
CREATE INDEX IF NOT EXISTS `idx_artworks_job` ON `artworks` (`job_id`);

-- collection_nodes — FK was already pointing to entities.id
CREATE TABLE `collection_nodes_new` (
    `id` text PRIMARY KEY NOT NULL REFERENCES `nodes`(`id`) ON DELETE CASCADE,
    `name` text NOT NULL,
    `description` text,
    `cover_image_url` text,
    `item_count` integer NOT NULL DEFAULT 0
);
INSERT INTO `collection_nodes_new` SELECT * FROM `collection_nodes`;
DROP TABLE `collection_nodes`;
ALTER TABLE `collection_nodes_new` RENAME TO `collection_nodes`;
CREATE INDEX IF NOT EXISTS `idx_collection_nodes_name` ON `collection_nodes` (`name`);

-- ── 10. Drop superseded tables ────────────────────────────────────────────────

DROP TABLE IF EXISTS `entity_relations`;
DROP TABLE IF EXISTS `entities`;
DROP TABLE IF EXISTS `artwork_artists`;
DROP TABLE IF EXISTS `portfolio_artworks`;
DROP TABLE IF EXISTS `profile_follows`;
DROP TABLE IF EXISTS `collection_items`;
DROP TABLE IF EXISTS `collection_members`;
DROP TABLE IF EXISTS `collection_placements`;
DROP TABLE IF EXISTS `collections`;
DROP TABLE IF EXISTS `artwork_access`;

PRAGMA foreign_keys = ON;
