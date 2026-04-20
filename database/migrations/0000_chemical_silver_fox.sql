CREATE TABLE `aggregate_athletes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`year` integer NOT NULL,
	`distance` text NOT NULL,
	`gender` text NOT NULL,
	`rank` integer NOT NULL,
	`athlete_id` integer NOT NULL,
	`name` text NOT NULL,
	`name_lower` text NOT NULL,
	`team` text DEFAULT '' NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`total_points` real DEFAULT 0 NOT NULL,
	`events_scored` integer DEFAULT 0 NOT NULL,
	`best_pos` integer DEFAULT 0 NOT NULL,
	`results_json` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agg_slice` ON `aggregate_athletes` (`year`,`distance`,`gender`,`rank`);--> statement-breakpoint
CREATE INDEX `idx_agg_athlete` ON `aggregate_athletes` (`athlete_id`);--> statement-breakpoint
CREATE TABLE `athlete_categories` (
	`athlete_id` integer NOT NULL,
	`year` integer NOT NULL,
	`category` text NOT NULL,
	PRIMARY KEY(`athlete_id`, `year`, `category`),
	FOREIGN KEY (`athlete_id`) REFERENCES `athletes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `athlete_lookup` (
	`key` text PRIMARY KEY NOT NULL,
	`athlete_id` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `athlete_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`athlete_id` integer NOT NULL,
	`event_id` integer NOT NULL,
	`event_name` text NOT NULL,
	`event_date` text NOT NULL,
	`event_year` integer NOT NULL,
	`distance` text NOT NULL,
	`pos` integer DEFAULT 0 NOT NULL,
	`gender_pos` integer DEFAULT 0 NOT NULL,
	`finisher_count` integer DEFAULT 0 NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`gender` text DEFAULT '' NOT NULL,
	`team` text DEFAULT '' NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`race_time` text DEFAULT '' NOT NULL,
	`race_time_secs` real DEFAULT 0 NOT NULL,
	`gap` text DEFAULT '' NOT NULL,
	`gap_secs` real DEFAULT 0 NOT NULL,
	`dnf` integer DEFAULT 0 NOT NULL,
	`dns` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`athlete_id`) REFERENCES `athletes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_athlete_results_athlete` ON `athlete_results` (`athlete_id`);--> statement-breakpoint
CREATE TABLE `athlete_teams` (
	`athlete_id` integer NOT NULL,
	`team_key` text NOT NULL,
	PRIMARY KEY(`athlete_id`, `team_key`),
	FOREIGN KEY (`athlete_id`) REFERENCES `athletes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `athletes` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_lower` text NOT NULL,
	`canonical_team` text
);
--> statement-breakpoint
CREATE INDEX `idx_athletes_name_lower` ON `athletes` (`name_lower`);--> statement-breakpoint
CREATE TABLE `event_distances` (
	`id` text NOT NULL,
	`event_id` integer NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`id`, `event_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`year` integer NOT NULL,
	`date` text NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`official_url` text,
	`results_url` text DEFAULT '' NOT NULL,
	`has_results` integer DEFAULT 0 NOT NULL,
	`participant_count` integer DEFAULT 0 NOT NULL,
	`finisher_count` integer DEFAULT 0 NOT NULL,
	`scraped_at` text
);
--> statement-breakpoint
CREATE TABLE `participants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`bib` text DEFAULT '' NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`full_name` text DEFAULT '' NOT NULL,
	`gender` text DEFAULT '' NOT NULL,
	`team` text DEFAULT '' NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`distance` text DEFAULT '' NOT NULL,
	`distance_id` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_participants_event` ON `participants` (`event_id`);--> statement-breakpoint
CREATE TABLE `result_licences` (
	`result_id` integer NOT NULL,
	`licence` text NOT NULL,
	PRIMARY KEY(`result_id`, `licence`),
	FOREIGN KEY (`result_id`) REFERENCES `results`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`distance_id` text NOT NULL,
	`distance_name` text NOT NULL,
	`finisher_count` integer DEFAULT 0 NOT NULL,
	`pos` integer DEFAULT 0 NOT NULL,
	`gender_pos` integer DEFAULT 0 NOT NULL,
	`athlete_id` integer DEFAULT 0 NOT NULL,
	`bib` text DEFAULT '' NOT NULL,
	`name` text NOT NULL,
	`name_lower` text NOT NULL,
	`gender` text DEFAULT '' NOT NULL,
	`team` text DEFAULT '' NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`race_time` text DEFAULT '' NOT NULL,
	`race_time_secs` real DEFAULT 0 NOT NULL,
	`gap` text DEFAULT '' NOT NULL,
	`gap_secs` real DEFAULT 0 NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`dnf` integer DEFAULT 0 NOT NULL,
	`dns` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_results_event` ON `results` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_results_athlete` ON `results` (`athlete_id`) WHERE athlete_id != 0;--> statement-breakpoint
CREATE INDEX `idx_results_filters` ON `results` (`event_id`,`distance_id`,`gender`,`category`);--> statement-breakpoint
CREATE INDEX `idx_results_pos` ON `results` (`event_id`,`distance_id`,`pos`);--> statement-breakpoint
CREATE TABLE `stats` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `team_aliases` (
	`alias_key` text PRIMARY KEY NOT NULL,
	`canonical_key` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `team_ranking` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`year` integer NOT NULL,
	`distance` text NOT NULL,
	`rank` integer NOT NULL,
	`team` text NOT NULL,
	`total_points` real DEFAULT 0 NOT NULL,
	`events_scored` integer DEFAULT 0 NOT NULL,
	`best_rank` integer DEFAULT 0 NOT NULL,
	`results_json` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_team_slice` ON `team_ranking` (`year`,`distance`,`rank`);