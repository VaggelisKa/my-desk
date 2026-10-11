CREATE TABLE `booking_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`desk_id` integer,
	`date` text NOT NULL,
	`date_timestamp` integer NOT NULL,
	`booked_at` integer,
	`ended_at` integer NOT NULL,
	`removed_by_admin` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_booking_history_date` ON `booking_history` (`date_timestamp`);--> statement-breakpoint
CREATE INDEX `idx_booking_history_user` ON `booking_history` (`user_id`,`date_timestamp`);--> statement-breakpoint
CREATE TRIGGER `booking_history_on_delete` AFTER DELETE ON `reservations`
WHEN OLD.`date` IS NOT NULL AND OLD.`date_timestamp` IS NOT NULL
BEGIN
	INSERT INTO `booking_history` (`user_id`, `desk_id`, `date`, `date_timestamp`, `booked_at`, `ended_at`)
	VALUES (OLD.`user_id`, OLD.`desk_id`, OLD.`date`, OLD.`date_timestamp`, OLD.`created_at`, unixepoch() * 1000);
END;
