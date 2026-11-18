CREATE TABLE IF NOT EXISTS `equipment_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `equipment_groups_org_idx` ON `equipment_groups` (`organization_id`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `managed_users` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
	`group_id` text REFERENCES `equipment_groups`(`id`) ON DELETE SET NULL,
	`display_name` text NOT NULL,
	`email` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `managed_users_org_idx` ON `managed_users` (`organization_id`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `installations` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`equipment_name` text NOT NULL,
	`sidc_target` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revoked_at` text,
	`shell_version` text NOT NULL,
	`sidc_version` text NOT NULL,
	`last_opened_at` text,
	`status` text DEFAULT 'active' NOT NULL,
	`organization_id` text REFERENCES `organizations`(`id`) ON DELETE SET NULL,
	`group_id` text REFERENCES `equipment_groups`(`id`) ON DELETE SET NULL,
	`assigned_user_id` text REFERENCES `managed_users`(`id`) ON DELETE SET NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `installations_token_hash_unique` ON `installations` (`token_hash`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `installations_status_idx` ON `installations` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `installations_org_idx` ON `installations` (`organization_id`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`installation_id` text NOT NULL REFERENCES `installations`(`id`) ON DELETE CASCADE,
	`started_at` text NOT NULL,
	`duration_months` integer NOT NULL,
	`due_at` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text NOT NULL,
	`reason` text NOT NULL,
	`updated_at` text NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cycles_installation_idx` ON `cycles` (`installation_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cycles_due_idx` ON `cycles` (`due_at`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `enrollment_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_by` text NOT NULL,
	`organization_id` text REFERENCES `organizations`(`id`) ON DELETE CASCADE,
	`group_id` text REFERENCES `equipment_groups`(`id`) ON DELETE SET NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `enrollment_codes_code_hash_unique` ON `enrollment_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `enrollment_codes_expires_idx` ON `enrollment_codes` (`expires_at`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `equipment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`installation_id` text REFERENCES `installations`(`id`) ON DELETE CASCADE,
	`cycle_id` text REFERENCES `cycles`(`id`) ON DELETE SET NULL,
	`open_id` text,
	`server_received_at` text NOT NULL,
	`type` text NOT NULL,
	`actor` text,
	`shell_version` text,
	`sidc_version` text,
	`windows_user` text,
	`equipment_name` text,
	`consent_state` text,
	`launch_result` text,
	`payload_json` text DEFAULT '{}' NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `equipment_events_inst_time_idx` ON `equipment_events` (`installation_id`,`server_received_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `equipment_events_type_time_idx` ON `equipment_events` (`type`,`server_received_at`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `terms_acceptances` (
	`id` text PRIMARY KEY NOT NULL,
	`installation_id` text NOT NULL REFERENCES `installations`(`id`) ON DELETE CASCADE,
	`terms_version` text NOT NULL,
	`accepted_at` text NOT NULL,
	`ip_address` text
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `terms_acceptances_inst_idx` ON `terms_acceptances` (`installation_id`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `support_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL UNIQUE REFERENCES `organizations`(`id`) ON DELETE CASCADE,
	`title` text DEFAULT 'Soporte Remoto' NOT NULL,
	`responsible_area` text DEFAULT 'Soporte TI' NOT NULL,
	`email` text,
	`phone` text,
	`hours` text,
	`ticket_url` text,
	`docs_url` text,
	`description` text,
	`temporary_notice` text,
	`updated_at` text NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `support_configs_org_idx` ON `support_configs` (`organization_id`);
