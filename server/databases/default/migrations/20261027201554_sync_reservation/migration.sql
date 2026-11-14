ALTER TABLE `connection` ADD `sync_reserved_until` integer;--> statement-breakpoint
-- Bank links kept Enable Banking's raw session id here; it lives sealed in `credentials`. The next sync writes its digest.
UPDATE `connection` SET `external_id` = NULL WHERE `provider` = 'enable_banking' AND `external_id` NOT LIKE 'sha256:%';
