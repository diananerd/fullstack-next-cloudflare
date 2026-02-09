CREATE TABLE `artwork_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`artwork_id` integer NOT NULL,
	`external_id` text,
	`method` text NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`step_order` integer NOT NULL,
	`input_url` text NOT NULL,
	`output_url` text,
	`output_key` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`error_message` text,
	`meta` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`artwork_id`) REFERENCES `artworks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_jobs_artwork_id` ON `artwork_jobs` (`artwork_id`);--> statement-breakpoint
CREATE INDEX `idx_jobs_status` ON `artwork_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_jobs_external_id` ON `artwork_jobs` (`external_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_artworks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`user_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`url` text NOT NULL,
	`method` text DEFAULT 'mist' NOT NULL,
	`protection_status` text DEFAULT 'done' NOT NULL,
	`job_id` text,
	`metadata` text,
	`width` integer,
	`height` integer,
	`size` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_artworks`("id", "title", "description", "user_id", "r2_key", "url", "method", "protection_status", "job_id", "metadata", "width", "height", "size", "created_at", "updated_at") SELECT "id", "title", "description", "user_id", "r2_key", "url", "method", "protection_status", "job_id", "metadata", "width", "height", "size", "created_at", "updated_at" FROM `artworks`;--> statement-breakpoint
DROP TABLE `artworks`;--> statement-breakpoint
ALTER TABLE `__new_artworks` RENAME TO `artworks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_artworks_user_id` ON `artworks` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_artworks_created_at` ON `artworks` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_artworks_status` ON `artworks` (`protection_status`);