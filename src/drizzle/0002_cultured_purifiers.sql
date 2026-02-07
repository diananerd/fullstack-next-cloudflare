CREATE TABLE `artworks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`user_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`url` text NOT NULL,
	`protection_status` text DEFAULT 'pending' NOT NULL,
	`width` integer,
	`height` integer,
	`size` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_artworks_user_id` ON `artworks` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_artworks_created_at` ON `artworks` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_artworks_status` ON `artworks` (`protection_status`);--> statement-breakpoint
DROP TABLE `categories`;--> statement-breakpoint
DROP TABLE `todos`;