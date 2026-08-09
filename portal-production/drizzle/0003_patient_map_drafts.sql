CREATE TABLE `patient_map_draft_fields` (
	`patient_id` text NOT NULL,
	`content_version` text NOT NULL,
	`field_type` text NOT NULL,
	`field_id` text NOT NULL,
	`generation` integer NOT NULL,
	`value` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`request_id` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`patient_id`, `content_version`, `field_type`, `field_id`),
	FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "patient_map_draft_field_type_check" CHECK("patient_map_draft_fields"."field_type" IN ('state', 'answer', 'position', 'synthesis')),
	CONSTRAINT "patient_map_draft_content_version_check" CHECK(length("patient_map_draft_fields"."content_version") BETWEEN 1 AND 80),
	CONSTRAINT "patient_map_draft_field_id_check" CHECK(length("patient_map_draft_fields"."field_id") BETWEEN 1 AND 80),
	CONSTRAINT "patient_map_draft_generation_check" CHECK("patient_map_draft_fields"."generation" >= 1),
	CONSTRAINT "patient_map_draft_value_check" CHECK("patient_map_draft_fields"."value" IS NULL OR length("patient_map_draft_fields"."value") <= 4096),
	CONSTRAINT "patient_map_draft_revision_check" CHECK("patient_map_draft_fields"."revision" >= 0),
	CONSTRAINT "patient_map_draft_request_id_check" CHECK(("patient_map_draft_fields"."field_type" = 'state' AND ("patient_map_draft_fields"."request_id" = '' OR length("patient_map_draft_fields"."request_id") BETWEEN 16 AND 80))
        OR ("patient_map_draft_fields"."field_type" <> 'state' AND length("patient_map_draft_fields"."request_id") BETWEEN 16 AND 80)),
	CONSTRAINT "patient_map_draft_state_shape_check" CHECK(("patient_map_draft_fields"."field_type" = 'state' AND "patient_map_draft_fields"."field_id" = '__state__' AND "patient_map_draft_fields"."value" IS NULL)
        OR ("patient_map_draft_fields"."field_type" <> 'state' AND "patient_map_draft_fields"."field_id" <> '__state__'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patient_map_draft_request_idx` ON `patient_map_draft_fields` (`patient_id`,`content_version`,`generation`,`request_id`) WHERE "patient_map_draft_fields"."request_id" <> '';