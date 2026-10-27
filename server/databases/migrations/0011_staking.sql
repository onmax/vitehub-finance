CREATE TABLE `staking_event` (
	`account_id` text NOT NULL,
	`id` text NOT NULL,
	`at` text NOT NULL,
	`kind` text NOT NULL,
	`atoms` text NOT NULL,
	`counterparty` text,
	`evidence` text NOT NULL,
	PRIMARY KEY(`account_id`, `id`),
	FOREIGN KEY (`account_id`) REFERENCES `financial_account`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `staking_event_account_at_idx` ON `staking_event` (`account_id`,`at`);--> statement-breakpoint
CREATE TABLE `staking_position` (
	`account_id` text PRIMARY KEY NOT NULL,
	`chain` text NOT NULL,
	`symbol` text NOT NULL,
	`decimals` integer NOT NULL,
	`validator` text,
	`validator_listed` integer,
	`liquid` text NOT NULL,
	`active` text NOT NULL,
	`inactive` text NOT NULL,
	`retired` text NOT NULL,
	`observed_at` text NOT NULL,
	`coverage_from` text NOT NULL,
	`coverage_to` text NOT NULL,
	`notes` text DEFAULT '[]' NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `financial_account`(`id`) ON UPDATE no action ON DELETE cascade
);
