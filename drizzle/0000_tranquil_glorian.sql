CREATE TABLE `access_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `access_logs_user_created_idx` ON `access_logs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `auth_windows` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`window_started_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`title` text NOT NULL,
	`happened` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`thoughts` text DEFAULT '' NOT NULL,
	`urge` text DEFAULT '' NOT NULL,
	`emotion` text DEFAULT '' NOT NULL,
	`intensity` integer DEFAULT 0 NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`shared_at` text,
	`revoked_at` text,
	FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entries_patient_created_idx` ON `entries` (`patient_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `entries_shared_idx` ON `entries` (`shared_at`,`revoked_at`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`therapist_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`used_at` text,
	`patient_id` text,
	`revoked_at` text,
	FOREIGN KEY (`therapist_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_code_hash_idx` ON `invitations` (`code_hash`);--> statement-breakpoint
CREATE INDEX `invitations_therapist_idx` ON `invitations` (`therapist_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `patient_links` (
	`id` text PRIMARY KEY NOT NULL,
	`therapist_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`closed_at` text,
	FOREIGN KEY (`therapist_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patient_links_unique_idx` ON `patient_links` (`therapist_id`,`patient_id`);--> statement-breakpoint
CREATE INDEX `patient_links_patient_idx` ON `patient_links` (`patient_id`,`status`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`csrf_token` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expiry_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `system_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`email_hash` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`password_salt` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_iterations` integer NOT NULL,
	`recovery_salt` text NOT NULL,
	`recovery_hash` text NOT NULL,
	`totp_secret` text,
	`totp_enabled` integer DEFAULT false NOT NULL,
	`last_totp_counter` integer,
	`privacy_version` text NOT NULL,
	`adult_confirmed_at` text,
	`created_at` text NOT NULL,
	`last_login_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_hash_idx` ON `users` (`email_hash`);--> statement-breakpoint
CREATE INDEX `users_role_status_idx` ON `users` (`role`,`status`);