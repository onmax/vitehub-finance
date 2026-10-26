ALTER TABLE `transaction` ADD `transfer_id` text;--> statement-breakpoint
CREATE INDEX `transaction_transfer_idx` ON `transaction` (`transfer_id`);