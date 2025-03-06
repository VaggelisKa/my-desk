CREATE INDEX `idx_desks_user_id` ON `desks` (`user_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_reservations` (
	`user_id` text NOT NULL,
	`desk_id` integer,
	`day` text NOT NULL,
	`week` integer NOT NULL,
	`date` text,
	`date_timestamp` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`desk_id`, `day`, `week`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`desk_id`) REFERENCES `desks`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_reservations`("user_id", "desk_id", "day", "week", "date", "date_timestamp", "created_at") SELECT "user_id", "desk_id", "day", "week", "date", "date_timestamp", "created_at" FROM `reservations`;--> statement-breakpoint
DROP TABLE `reservations`;--> statement-breakpoint
ALTER TABLE `__new_reservations` RENAME TO `reservations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_reservations_desk_id` ON `reservations` (`desk_id`);