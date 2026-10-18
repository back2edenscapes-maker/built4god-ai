CREATE TABLE `orders` (
	`session_hash` text PRIMARY KEY NOT NULL,
	`payment_intent` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`paid_at` integer NOT NULL,
	`livemode` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_payment_intent_unique` ON `orders` (`payment_intent`);--> statement-breakpoint
CREATE TABLE `receipts` (
	`event_id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `refunds` (
	`payment_intent` text PRIMARY KEY NOT NULL,
	`amount_cents` integer NOT NULL
);
