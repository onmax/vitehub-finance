ALTER TABLE `household_settings` ADD `ai_categorize` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `transaction` ADD `category_source` text;--> statement-breakpoint
ALTER TABLE `transaction` ADD `ai_checked_at` integer;--> statement-breakpoint
ALTER TABLE `transaction` ADD `hidden` integer DEFAULT false NOT NULL;