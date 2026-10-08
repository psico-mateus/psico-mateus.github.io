CREATE TABLE `patient_notices` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`therapist_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text,
	`client_request_id` text,
	`deleted_at` text,
	FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`therapist_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "patient_notices_content_check" CHECK(("patient_notices"."deleted_at" IS NULL AND length("patient_notices"."title") BETWEEN 1 AND 100 AND length("patient_notices"."body") BETWEEN 1 AND 2000) OR ("patient_notices"."deleted_at" IS NOT NULL AND "patient_notices"."title" = '' AND "patient_notices"."body" = '')),
	CONSTRAINT "patient_notices_request_id_check" CHECK("patient_notices"."client_request_id" IS NULL OR length("patient_notices"."client_request_id") BETWEEN 16 AND 80)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patient_notices_request_idx` ON `patient_notices` (`therapist_id`,`patient_id`,`client_request_id`);--> statement-breakpoint
CREATE INDEX `patient_notices_patient_created_idx` ON `patient_notices` (`patient_id`,`deleted_at`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `patient_notices_therapist_patient_created_idx` ON `patient_notices` (`therapist_id`,`patient_id`,`created_at`);