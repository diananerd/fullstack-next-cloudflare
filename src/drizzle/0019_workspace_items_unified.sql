-- Migration: Unified workspace_items table
-- Replaces: artworks + collections + collection_items + collection_placements + collection_members
-- IDs change from INTEGER to TEXT (UUID) for artworks

-- ── 1. Create workspace_items (unified tree node) ─────────────────────────────
CREATE TABLE `workspace_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`parent_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`visibility` text DEFAULT 'private' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`r2_key` text,
	`url` text,
	`width` integer,
	`height` integer,
	`protection_status` text DEFAULT 'IDLE',
	`job_id` text,
	`method` text DEFAULT 'shield',
	`metadata` text,
	`size` integer,
	`semantic_type` text DEFAULT 'digital_art',
	`item_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `workspace_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_workspace_items_user_parent` ON `workspace_items` (`user_id`,`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_workspace_items_user_kind` ON `workspace_items` (`user_id`,`kind`);--> statement-breakpoint
CREATE INDEX `idx_workspace_items_status` ON `workspace_items` (`protection_status`);--> statement-breakpoint
CREATE INDEX `idx_workspace_items_job` ON `workspace_items` (`job_id`);--> statement-breakpoint
CREATE INDEX `idx_workspace_items_created` ON `workspace_items` (`created_at`);--> statement-breakpoint

-- ── 2. Migrate existing artworks → workspace_items ───────────────────────────
INSERT INTO `workspace_items` (
	`id`, `user_id`, `parent_id`, `kind`,
	`title`, `description`, `visibility`, `position`,
	`created_at`, `updated_at`,
	`r2_key`, `url`, `width`, `height`,
	`protection_status`, `job_id`, `method`, `metadata`, `size`, `semantic_type`,
	`item_count`
)
SELECT
	CAST(`id` AS TEXT),
	`user_id`,
	NULL,
	'artwork',
	`title`,
	`description`,
	COALESCE(`visibility`, 'private'),
	0,
	`created_at`,
	`updated_at`,
	`r2_key`,
	`url`,
	`width`,
	`height`,
	`protection_status`,
	`job_id`,
	`method`,
	`metadata`,
	`size`,
	COALESCE(`semantic_type`, 'digital_art'),
	0
FROM `artworks`;
--> statement-breakpoint

-- ── 3. Migrate collections → workspace_items ─────────────────────────────────
INSERT INTO `workspace_items` (
	`id`, `user_id`, `parent_id`, `kind`,
	`title`, `description`, `visibility`, `position`,
	`created_at`, `updated_at`,
	`item_count`
)
SELECT
	`id`,
	`created_by_user_id`,
	NULL,
	'collection',
	`title`,
	`description`,
	COALESCE(`visibility`, 'private'),
	0,
	`created_at`,
	`updated_at`,
	COALESCE(`item_count`, 0)
FROM `collections`;
--> statement-breakpoint

-- ── 4. Set parentId on artworks that belong to collections ────────────────────
-- (via collection_items → artwork lives inside the collection node)
UPDATE `workspace_items`
SET `parent_id` = (
	SELECT `collection_id`
	FROM `collection_items`
	WHERE CAST(`collection_items`.`artwork_id` AS TEXT) = `workspace_items`.`id`
	LIMIT 1
)
WHERE `kind` = 'artwork'
  AND EXISTS (
	SELECT 1
	FROM `collection_items`
	WHERE CAST(`collection_items`.`artwork_id` AS TEXT) = `workspace_items`.`id`
);
--> statement-breakpoint

-- ── 5. Update artwork_jobs.artwork_id references to string IDs ───────────────
-- SQLite stores the CAST(integer AS text) we inserted above
-- artwork_jobs.artwork_id is INTEGER column but will hold text after this update
UPDATE `artwork_jobs`
SET `artwork_id` = CAST(`artwork_id` AS TEXT)
WHERE `artwork_id` IS NOT NULL;
