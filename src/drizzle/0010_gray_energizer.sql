CREATE TABLE `credit_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`amount` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`reference_id` text,
	`metadata` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `user` ADD `credits` integer DEFAULT 0 NOT NULL;