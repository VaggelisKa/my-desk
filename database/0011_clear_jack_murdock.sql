CREATE TABLE `reservations2` (
	`user_id` text NOT NULL,
	`desk_id` integer,
	`day` text NOT NULL,
	`week` integer NOT NULL,
	`date` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`day`, `desk_id`, `week`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`desk_id`) REFERENCES `desks`(`id`) ON UPDATE cascade ON DELETE cascade
);
