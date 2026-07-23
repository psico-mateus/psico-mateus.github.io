CREATE TABLE `assisted_recovery_grants` (
	`user_id` text PRIMARY KEY NOT NULL,
	`issued_by` text,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`issued_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `assisted_recovery_expiry_idx` ON `assisted_recovery_grants` (`expires_at`);
