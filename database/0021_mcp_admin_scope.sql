ALTER TABLE `oauth_codes` ADD `scope` text DEFAULT 'desks' NOT NULL;--> statement-breakpoint
ALTER TABLE `oauth_tokens` ADD `scope` text DEFAULT 'desks' NOT NULL;