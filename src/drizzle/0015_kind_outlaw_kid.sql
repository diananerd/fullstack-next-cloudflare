CREATE TABLE `artwork_artists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`artwork_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'creator' NOT NULL,
	`note` text,
	`added_at` text NOT NULL,
	FOREIGN KEY (`artwork_id`) REFERENCES `artworks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_artwork_artists_artwork_id` ON `artwork_artists` (`artwork_id`);--> statement-breakpoint
CREATE INDEX `idx_artwork_artists_user_id` ON `artwork_artists` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_artwork_artists_role` ON `artwork_artists` (`role`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_artwork_artist_role` ON `artwork_artists` (`artwork_id`,`user_id`,`role`);