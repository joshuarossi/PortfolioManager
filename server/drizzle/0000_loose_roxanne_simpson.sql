CREATE TABLE `ai_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `balance_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`exchange_id` text NOT NULL,
	`wallet_type` text NOT NULL,
	`currency` text NOT NULL,
	`balance` real NOT NULL,
	`available_balance` real,
	`usd_value` real,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`exchange_id`) REFERENCES `exchanges`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `exchanges` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`api_key_encrypted` text NOT NULL,
	`api_secret_encrypted` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_synced_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `portfolio_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`total_usd_value` real NOT NULL,
	`breakdown` text NOT NULL,
	`captured_at` integer NOT NULL
);
