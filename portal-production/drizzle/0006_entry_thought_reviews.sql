CREATE TABLE `entry_thought_reviews` (
	`entry_id` text PRIMARY KEY NOT NULL,
	`source_thought` text NOT NULL,
	`supporting_context` text DEFAULT '' NOT NULL,
	`missing_context` text DEFAULT '' NOT NULL,
	`alternative_view` text DEFAULT '' NOT NULL,
	`current_view` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "entry_thought_reviews_source_thought_check" CHECK(length("entry_thought_reviews"."source_thought") BETWEEN 1 AND 1500),
	CONSTRAINT "entry_thought_reviews_supporting_context_check" CHECK(length("entry_thought_reviews"."supporting_context") <= 1500),
	CONSTRAINT "entry_thought_reviews_missing_context_check" CHECK(length("entry_thought_reviews"."missing_context") <= 1500),
	CONSTRAINT "entry_thought_reviews_alternative_view_check" CHECK(length("entry_thought_reviews"."alternative_view") <= 1500),
	CONSTRAINT "entry_thought_reviews_current_view_check" CHECK(length("entry_thought_reviews"."current_view") <= 1500),
	CONSTRAINT "entry_thought_reviews_revision_check" CHECK("entry_thought_reviews"."revision" >= 1)
);
--> statement-breakpoint
-- Estes gatilhos mantêm a revisão e a data do Registro na mesma transação.
-- Se um compare-and-set não alterar a revisão, nenhum gatilho é executado e
-- `entries.updated_at` permanece intacto.
CREATE TRIGGER `entry_thought_reviews_touch_entry_after_insert`
AFTER INSERT ON `entry_thought_reviews`
BEGIN
	UPDATE `entries`
	SET `updated_at` = CASE
		WHEN COALESCE(
			(SELECT MAX(`viewed_at`) FROM `entry_views` WHERE `entry_id` = NEW.`entry_id`),
			''
		) >= MAX(`entries`.`updated_at`, NEW.`updated_at`)
		THEN strftime(
			'%Y-%m-%dT%H:%M:%fZ',
			julianday(
				(SELECT MAX(`viewed_at`) FROM `entry_views` WHERE `entry_id` = NEW.`entry_id`)
			) + (1.0 / 86400000.0)
		)
		ELSE MAX(`entries`.`updated_at`, NEW.`updated_at`)
	END
	WHERE `id` = NEW.`entry_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `entry_thought_reviews_touch_entry_after_update`
AFTER UPDATE ON `entry_thought_reviews`
BEGIN
	UPDATE `entries`
	SET `updated_at` = CASE
		WHEN COALESCE(
			(SELECT MAX(`viewed_at`) FROM `entry_views` WHERE `entry_id` = NEW.`entry_id`),
			''
		) >= MAX(`entries`.`updated_at`, NEW.`updated_at`)
		THEN strftime(
			'%Y-%m-%dT%H:%M:%fZ',
			julianday(
				(SELECT MAX(`viewed_at`) FROM `entry_views` WHERE `entry_id` = NEW.`entry_id`)
			) + (1.0 / 86400000.0)
		)
		ELSE MAX(`entries`.`updated_at`, NEW.`updated_at`)
	END
	WHERE `id` = NEW.`entry_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `entry_thought_reviews_touch_entry_after_delete`
AFTER DELETE ON `entry_thought_reviews`
BEGIN
	UPDATE `entries`
	SET `updated_at` = CASE
		WHEN COALESCE(
			(SELECT MAX(`viewed_at`) FROM `entry_views` WHERE `entry_id` = OLD.`entry_id`),
			''
		) >= MAX(
			`entries`.`updated_at`,
			strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		)
		THEN strftime(
			'%Y-%m-%dT%H:%M:%fZ',
			julianday(
				(SELECT MAX(`viewed_at`) FROM `entry_views` WHERE `entry_id` = OLD.`entry_id`)
			) + (1.0 / 86400000.0)
		)
		ELSE MAX(
			`entries`.`updated_at`,
			strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		)
	END
	WHERE `id` = OLD.`entry_id`;
END;
