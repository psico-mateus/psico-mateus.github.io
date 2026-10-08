-- Somente autenticação profissional; nenhum conteúdo clínico é alterado.
CREATE TABLE `professional_mfa_recovery_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`set_id` text NOT NULL,
	`position` integer NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`used_at` text,
	`invalidated_at` text,
	`consumption_nonce` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "professional_mfa_recovery_codes_position_check" CHECK("professional_mfa_recovery_codes"."position" BETWEEN 1 AND 8)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `professional_mfa_recovery_codes_hash_idx` ON `professional_mfa_recovery_codes` (`code_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `professional_mfa_recovery_codes_set_position_idx` ON `professional_mfa_recovery_codes` (`set_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `professional_mfa_recovery_codes_consumption_nonce_idx` ON `professional_mfa_recovery_codes` (`consumption_nonce`) WHERE "professional_mfa_recovery_codes"."consumption_nonce" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `professional_mfa_recovery_codes_user_status_idx` ON `professional_mfa_recovery_codes` (`user_id`,`set_id`,`used_at`,`invalidated_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `mfa_recovery_set_id` text;
