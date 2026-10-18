CREATE TABLE `recovery_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`order_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recovery_codes_order_hash_unique` ON `recovery_codes` (`order_hash`);