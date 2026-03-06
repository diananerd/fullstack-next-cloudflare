CREATE TABLE `artwork_credits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`artwork_id` integer NOT NULL,
	`user_id` text,
	`external_name` text,
	`external_url` text,
	`role` text DEFAULT 'collaborator' NOT NULL,
	`note` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`is_public` integer DEFAULT true NOT NULL,
	`added_at` text NOT NULL,
	FOREIGN KEY (`artwork_id`) REFERENCES `artworks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artwork_credits_user_role_unique` ON `artwork_credits` (`artwork_id`,`user_id`,`role`);--> statement-breakpoint
CREATE INDEX `idx_artwork_credits_artwork` ON `artwork_credits` (`artwork_id`);--> statement-breakpoint
CREATE INDEX `idx_artwork_credits_user` ON `artwork_credits` (`user_id`);--> statement-breakpoint
CREATE TABLE `artwork_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`artwork_id` integer NOT NULL,
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
	FOREIGN KEY (`artwork_id`) REFERENCES `artworks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_artwork_files_artwork_id` ON `artwork_files` (`artwork_id`);--> statement-breakpoint
CREATE INDEX `idx_artwork_files_role` ON `artwork_files` (`artwork_id`,`role`);--> statement-breakpoint
CREATE UNIQUE INDEX `artwork_files_r2_key_unique` ON `artwork_files` (`r2_key`);--> statement-breakpoint
CREATE TABLE `artwork_relations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_artwork_id` integer NOT NULL,
	`target_artwork_id` integer NOT NULL,
	`relation_type` text NOT NULL,
	`reference_metadata` text,
	`created_by_user_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`source_artwork_id`) REFERENCES `artworks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_artwork_id`) REFERENCES `artworks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artwork_relations_unique` ON `artwork_relations` (`source_artwork_id`,`target_artwork_id`,`relation_type`);--> statement-breakpoint
CREATE INDEX `idx_artwork_relations_source` ON `artwork_relations` (`source_artwork_id`);--> statement-breakpoint
CREATE INDEX `idx_artwork_relations_target` ON `artwork_relations` (`target_artwork_id`);--> statement-breakpoint
CREATE TABLE `artwork_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`artwork_id` integer NOT NULL,
	`previous_snapshot_id` integer,
	`reason` text DEFAULT 'manual' NOT NULL,
	`snapshot_data` text NOT NULL,
	`label` text,
	`created_by_user_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`artwork_id`) REFERENCES `artworks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_artwork_snapshots_artwork` ON `artwork_snapshots` (`artwork_id`);--> statement-breakpoint
CREATE INDEX `idx_artwork_snapshots_created` ON `artwork_snapshots` (`artwork_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `credit_escrow` (
	`id` text PRIMARY KEY NOT NULL,
	`from_user_id` text NOT NULL,
	`to_user_id` text NOT NULL,
	`amount_credits` integer NOT NULL,
	`status` text DEFAULT 'held' NOT NULL,
	`commission_id` text NOT NULL,
	`milestone_id` integer,
	`hold_tx_id` text,
	`resolve_tx_id` text,
	`held_at` text NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`from_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`to_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_credit_escrow_from` ON `credit_escrow` (`from_user_id`);--> statement-breakpoint
CREATE INDEX `idx_credit_escrow_to` ON `credit_escrow` (`to_user_id`);--> statement-breakpoint
CREATE INDEX `idx_credit_escrow_commission` ON `credit_escrow` (`commission_id`);--> statement-breakpoint
CREATE INDEX `idx_credit_escrow_status` ON `credit_escrow` (`status`);--> statement-breakpoint
ALTER TABLE `artworks` ADD `semantic_type` text DEFAULT 'digital_art';--> statement-breakpoint
ALTER TABLE `artworks` ADD `visibility` text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE `credit_transactions` ADD `to_user_id` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `credit_transactions` ADD `service_type` text;--> statement-breakpoint
ALTER TABLE `credit_transactions` ADD `commission_id` text;--> statement-breakpoint
ALTER TABLE `credit_transactions` ADD `milestone_id` integer;--> statement-breakpoint
CREATE INDEX `idx_credit_tx_user_id` ON `credit_transactions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_credit_tx_to_user` ON `credit_transactions` (`to_user_id`);--> statement-breakpoint
CREATE INDEX `idx_credit_tx_type` ON `credit_transactions` (`type`);--> statement-breakpoint
CREATE INDEX `idx_credit_tx_commission` ON `credit_transactions` (`commission_id`);