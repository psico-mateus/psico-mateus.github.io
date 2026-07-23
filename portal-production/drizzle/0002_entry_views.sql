CREATE TABLE `entry_views` (
	`entry_id` text NOT NULL,
	`therapist_id` text NOT NULL,
	`viewed_at` text NOT NULL,
	PRIMARY KEY(`entry_id`, `therapist_id`),
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`therapist_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entry_views_therapist_idx` ON `entry_views` (`therapist_id`,`viewed_at`);
