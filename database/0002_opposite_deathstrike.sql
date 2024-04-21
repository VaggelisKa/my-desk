CREATE TABLE `desks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`row` integer NOT NULL,
	`column` integer NOT NULL,
	`user_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `reservations` (
	`user_id` text NOT NULL,
	`desk_id` integer,
	`day` text NOT NULL,
	`week` integer NOT NULL,
	PRIMARY KEY(`desk_id`, `user_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `desks_row_column_unique` ON `desks` (`row`,`column`);