CREATE TABLE `customer_contacts` (
	`order_hash` text PRIMARY KEY NOT NULL,
	`email_hash` text NOT NULL,
	`email_cipher` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contacts_email_idx` ON `customer_contacts` (`email_hash`);--> statement-breakpoint
CREATE TABLE `request_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`order_hash` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	`next_attempt` integer NOT NULL,
	`lease_until` integer NOT NULL,
	`attempts` integer NOT NULL,
	`status` text NOT NULL,
	`sent_at` integer
);
--> statement-breakpoint
CREATE TABLE `app_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `access_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`order_hash` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `traffic_daily` (
	`day` text NOT NULL,
	`event` text NOT NULL,
	`source` text NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`day`, `event`, `source`)
);
