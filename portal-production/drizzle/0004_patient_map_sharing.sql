CREATE TABLE `patient_map_shares` (
	`patient_id` text NOT NULL,
	`therapist_id` text NOT NULL,
	`map_id` text NOT NULL,
	`content_version` text NOT NULL,
	`snapshot` text NOT NULL,
	`shared_at` text NOT NULL,
	`viewed_at` text,
	PRIMARY KEY(`patient_id`, `map_id`),
	FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`therapist_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "patient_map_shares_map_id_check" CHECK(length("patient_map_shares"."map_id") BETWEEN 1 AND 80),
	CONSTRAINT "patient_map_shares_content_version_check" CHECK(length("patient_map_shares"."content_version") BETWEEN 1 AND 80),
	CONSTRAINT "patient_map_shares_snapshot_check" CHECK(length("patient_map_shares"."snapshot") BETWEEN 2 AND 65536)
);
--> statement-breakpoint
CREATE INDEX `patient_map_shares_therapist_idx` ON `patient_map_shares` (`therapist_id`,`shared_at`);