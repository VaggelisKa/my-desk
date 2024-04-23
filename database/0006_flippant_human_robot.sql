CREATE TABLE `reservations_new` (
	`user_id` text NOT NULL,
	`desk_id` integer,
	`day` text NOT NULL,
	`week` integer NOT NULL,
	PRIMARY KEY(`day`, `desk_id`, `user_id`, `week`)
);
--> statement-breakpoint
DROP TABLE `reservations`;