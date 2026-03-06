CREATE TABLE `board_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`board_id` integer NOT NULL,
	`artwork_id` integer,
	`external_url` text,
	`external_title` text,
	`external_image_url` text,
	`note` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artwork_id`) REFERENCES `artworks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `board_items_board_artwork_unique` ON `board_items` (`board_id`,`artwork_id`);--> statement-breakpoint
CREATE INDEX `idx_board_items_board_position` ON `board_items` (`board_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_board_items_artwork_id` ON `board_items` (`artwork_id`);--> statement-breakpoint
CREATE TABLE `boards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text,
	`title` text NOT NULL,
	`description` text,
	`cover_r2_key` text,
	`cover_url` text,
	`visibility` text DEFAULT 'private' NOT NULL,
	`item_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_boards_user_id` ON `boards` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_boards_organization_id` ON `boards` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_boards_visibility` ON `boards` (`visibility`);--> statement-breakpoint
CREATE TABLE `commission_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`commission_id` text NOT NULL,
	`sender_user_id` text NOT NULL,
	`body` text NOT NULL,
	`attachment_url` text,
	`attachment_r2_key` text,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`commission_id`) REFERENCES `commissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_commission_messages_commission_created` ON `commission_messages` (`commission_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_commission_messages_sender` ON `commission_messages` (`sender_user_id`);--> statement-breakpoint
CREATE TABLE `commission_milestones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`commission_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`due_date` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`submitted_at` text,
	`approved_at` text,
	`released_at` text,
	`delivery_note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`commission_id`) REFERENCES `commissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_commission_milestones_commission_id` ON `commission_milestones` (`commission_id`);--> statement-breakpoint
CREATE INDEX `idx_commission_milestones_status` ON `commission_milestones` (`status`);--> statement-breakpoint
CREATE TABLE `commission_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`commission_id` text NOT NULL,
	`milestone_id` integer,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`stripe_payment_intent_id` text,
	`stripe_transfer_id` text,
	`stripe_refund_id` text,
	`held_at` text,
	`released_at` text,
	`refunded_at` text,
	`metadata` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`commission_id`) REFERENCES `commissions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`milestone_id`) REFERENCES `commission_milestones`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commission_payments_stripe_payment_intent_id_unique` ON `commission_payments` (`stripe_payment_intent_id`);--> statement-breakpoint
CREATE INDEX `idx_commission_payments_commission_id` ON `commission_payments` (`commission_id`);--> statement-breakpoint
CREATE INDEX `idx_commission_payments_milestone_id` ON `commission_payments` (`milestone_id`);--> statement-breakpoint
CREATE INDEX `idx_commission_payments_status` ON `commission_payments` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `commission_payments_stripe_pi_unique` ON `commission_payments` (`stripe_payment_intent_id`);--> statement-breakpoint
CREATE TABLE `commission_reference_artworks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`commission_id` text NOT NULL,
	`artwork_id` integer,
	`external_url` text,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`commission_id`) REFERENCES `commissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artwork_id`) REFERENCES `artworks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_commission_refs_commission_id` ON `commission_reference_artworks` (`commission_id`);--> statement-breakpoint
CREATE TABLE `commissions` (
	`id` text PRIMARY KEY NOT NULL,
	`client_user_id` text NOT NULL,
	`artist_organization_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`budget_min_cents` integer,
	`budget_max_cents` integer,
	`currency` text DEFAULT 'usd' NOT NULL,
	`deadline` text,
	`canceled_by_user_id` text,
	`canceled_at` text,
	`completed_at` text,
	`metadata` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`client_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`artist_organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`canceled_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_commissions_client_user_id` ON `commissions` (`client_user_id`);--> statement-breakpoint
CREATE INDEX `idx_commissions_artist_org_id` ON `commissions` (`artist_organization_id`);--> statement-breakpoint
CREATE INDEX `idx_commissions_status` ON `commissions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_commissions_created_at` ON `commissions` (`created_at`);--> statement-breakpoint
CREATE TABLE `invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer,
	`inviter_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `member` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	`profile_type` text DEFAULT 'individual',
	`bio` text,
	`website_url` text,
	`visibility` text DEFAULT 'public',
	`stripe_connect_id` text,
	`stripe_connect_status` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_unique` ON `organization` (`slug`);--> statement-breakpoint
CREATE TABLE `portfolio_artworks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`artwork_id` integer NOT NULL,
	`is_featured` integer DEFAULT false NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`added_at` text NOT NULL,
	`added_by_user_id` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artwork_id`) REFERENCES `artworks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portfolio_artworks_org_artwork_unique` ON `portfolio_artworks` (`organization_id`,`artwork_id`);--> statement-breakpoint
CREATE INDEX `idx_portfolio_artworks_org_featured` ON `portfolio_artworks` (`organization_id`,`is_featured`);--> statement-breakpoint
CREATE INDEX `idx_portfolio_artworks_artwork_id` ON `portfolio_artworks` (`artwork_id`);--> statement-breakpoint
CREATE TABLE `profile_follows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`follower_user_id` text NOT NULL,
	`following_organization_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`follower_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`following_organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_follows_unique` ON `profile_follows` (`follower_user_id`,`following_organization_id`);--> statement-breakpoint
CREATE INDEX `idx_profile_follows_follower` ON `profile_follows` (`follower_user_id`);--> statement-breakpoint
CREATE INDEX `idx_profile_follows_following` ON `profile_follows` (`following_organization_id`);--> statement-breakpoint
ALTER TABLE `session` ADD `active_organization_id` text;--> statement-breakpoint
ALTER TABLE `user` ADD `onboarded_at` text;