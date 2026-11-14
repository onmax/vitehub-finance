CREATE TABLE `forecast_plan` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`scenario` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `forecast_plan_household` ON `forecast_plan` (`household_id`);--> statement-breakpoint
CREATE TABLE `transaction_review` (
	`transaction_id` text PRIMARY KEY NOT NULL,
	`reviewed_at` integer,
	`reviewed_by` text,
	`assigned_to` text,
	`splits` text,
	`reimbursement_of` text,
	`revision` text NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transaction`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assigned_to`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reimbursement_of`) REFERENCES `transaction`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `transaction_review_assigned_idx` ON `transaction_review` (`assigned_to`);--> statement-breakpoint
CREATE TABLE `budget_version` (
	`budget_id` text NOT NULL,
	`effective_month` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`carry_enabled` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`budget_id`, `effective_month`),
	FOREIGN KEY (`budget_id`) REFERENCES `budget`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `finance_setup` (
	`household_id` text NOT NULL,
	`user_id` text NOT NULL,
	`dismissed` integer DEFAULT false NOT NULL,
	`sharing_reviewed` integer DEFAULT false NOT NULL,
	`recurring_reviewed` integer DEFAULT false NOT NULL,
	`forecast_reviewed` integer DEFAULT false NOT NULL,
	`checkin_month` text,
	PRIMARY KEY(`household_id`, `user_id`),
	FOREIGN KEY (`household_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `goal` ADD `allocation_reviewed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `goal` ADD `completed_at` integer;