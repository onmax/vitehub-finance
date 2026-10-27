CREATE TABLE `dismissed_suggestion` (
	`household_id` text NOT NULL,
	`key` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`household_id`, `key`),
	FOREIGN KEY (`household_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_rule` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`match` text NOT NULL,
	`category_id` text,
	`exclude` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_rule`("id", "household_id", "match", "category_id", "exclude", "created_at") SELECT "id", "household_id", "match", "category_id", "exclude", "created_at" FROM `rule`;--> statement-breakpoint
DROP TABLE `rule`;--> statement-breakpoint
ALTER TABLE `__new_rule` RENAME TO `rule`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `rule_household_idx` ON `rule` (`household_id`);--> statement-breakpoint
ALTER TABLE `transaction` ADD `exclude_source` text;--> statement-breakpoint
UPDATE `transaction` SET `exclude_source` = 'rule' WHERE `excluded` = 1 AND (`category_source` IS NULL OR `category_source` <> 'manual') AND EXISTS (SELECT 1 FROM `rule` WHERE `rule`.`household_id` = `transaction`.`household_id` AND `rule`.`exclude` = 1 AND (lower(`transaction`.`description`) LIKE '%' || `rule`.`match` || '%' OR lower(coalesce(`transaction`.`counterparty`, '')) LIKE '%' || `rule`.`match` || '%'));--> statement-breakpoint
UPDATE `transaction` SET `exclude_source` = 'manual' WHERE `excluded` = 1 AND `exclude_source` IS NULL;
