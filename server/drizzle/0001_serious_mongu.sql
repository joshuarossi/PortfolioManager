PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_exchanges` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`api_key_encrypted` text,
	`api_secret_encrypted` text,
	`wallet_address` text,
	`is_active` integer DEFAULT true NOT NULL,
	`last_synced_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_exchanges`("id", "name", "type", "label", "api_key_encrypted", "api_secret_encrypted", "wallet_address", "is_active", "last_synced_at", "created_at") SELECT "id", "name", "type", "label", "api_key_encrypted", "api_secret_encrypted", "wallet_address", "is_active", "last_synced_at", "created_at" FROM `exchanges`;--> statement-breakpoint
DROP TABLE `exchanges`;--> statement-breakpoint
ALTER TABLE `__new_exchanges` RENAME TO `exchanges`;--> statement-breakpoint
PRAGMA foreign_keys=ON;