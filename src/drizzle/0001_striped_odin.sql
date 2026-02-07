CREATE INDEX `idx_todos_user_id` ON `todos` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_todos_created_at` ON `todos` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_todos_completed` ON `todos` (`completed`);