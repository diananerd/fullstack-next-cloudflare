CREATE TABLE `artwork_access` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`artwork_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`source_type` text DEFAULT 'direct' NOT NULL,
	`source_id` text,
	`granted_by_user_id` text,
	`expires_at` text,
	`granted_at` text NOT NULL,
	FOREIGN KEY (`artwork_id`) REFERENCES `artworks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artwork_access_unique` ON `artwork_access` (`artwork_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_artwork_access_artwork` ON `artwork_access` (`artwork_id`);--> statement-breakpoint
CREATE INDEX `idx_artwork_access_user` ON `artwork_access` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_artwork_access_source` ON `artwork_access` (`source_type`,`source_id`);--> statement-breakpoint
CREATE TABLE `collection_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`collection_id` text NOT NULL,
	`artwork_id` integer,
	`external_url` text,
	`external_title` text,
	`external_image_url` text,
	`note` text,
	`position` integer DEFAULT 0 NOT NULL,
	`added_by_user_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artwork_id`) REFERENCES `artworks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_items_coll_artwork_unique` ON `collection_items` (`collection_id`,`artwork_id`);--> statement-breakpoint
CREATE INDEX `idx_collection_items_coll_position` ON `collection_items` (`collection_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_collection_items_artwork` ON `collection_items` (`artwork_id`);--> statement-breakpoint
CREATE TABLE `collection_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`collection_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`source_type` text DEFAULT 'direct' NOT NULL,
	`source_id` text,
	`granted_by_user_id` text,
	`expires_at` text,
	`granted_at` text NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_members_unique` ON `collection_members` (`collection_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_collection_members_collection` ON `collection_members` (`collection_id`);--> statement-breakpoint
CREATE INDEX `idx_collection_members_user` ON `collection_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `collection_placements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`collection_id` text NOT NULL,
	`context_type` text NOT NULL,
	`context_id` text NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`is_pinned` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_placements_unique` ON `collection_placements` (`collection_id`,`context_type`,`context_id`);--> statement-breakpoint
CREATE INDEX `idx_collection_placements_context` ON `collection_placements` (`context_type`,`context_id`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`created_by_user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`cover_r2_key` text,
	`cover_url` text,
	`visibility` text DEFAULT 'private' NOT NULL,
	`membership_inheritance` text DEFAULT 'none' NOT NULL,
	`item_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_collections_created_by` ON `collections` (`created_by_user_id`);--> statement-breakpoint
CREATE INDEX `idx_collections_visibility` ON `collections` (`visibility`);--> statement-breakpoint
CREATE TABLE `resource_role_policies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text,
	`role` text NOT NULL,
	`allowed_actions` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resource_role_policies_unique` ON `resource_role_policies` (`resource_type`,`resource_id`,`role`);--> statement-breakpoint
CREATE INDEX `idx_rrp_resource` ON `resource_role_policies` (`resource_type`,`resource_id`);--> statement-breakpoint
DROP TABLE `board_items`;--> statement-breakpoint
DROP TABLE `boards`;