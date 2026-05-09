CREATE TABLE `aggregate_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`aggregate_athlete_id` integer NOT NULL,
	`event_id` integer NOT NULL,
	`event_name` text DEFAULT '' NOT NULL,
	`event_date` text DEFAULT '' NOT NULL,
	`distance_finishers` integer DEFAULT 0 NOT NULL,
	`coefficient` real DEFAULT 0 NOT NULL,
	`pos` integer DEFAULT 0 NOT NULL,
	`base_points` real DEFAULT 0 NOT NULL,
	`points` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`aggregate_athlete_id`) REFERENCES `aggregate_athletes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_ar_athlete` ON `aggregate_results` (`aggregate_athlete_id`);--> statement-breakpoint
CREATE TABLE `team_race_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_ranking_id` integer NOT NULL,
	`event_id` integer NOT NULL,
	`event_name` text DEFAULT '' NOT NULL,
	`event_date` text DEFAULT '' NOT NULL,
	`total_teams` integer DEFAULT 0 NOT NULL,
	`eligible_teams` integer DEFAULT 0 NOT NULL,
	`coefficient` real DEFAULT 0 NOT NULL,
	`team_rank` integer DEFAULT 0 NOT NULL,
	`base_points` real DEFAULT 0 NOT NULL,
	`points` real DEFAULT 0 NOT NULL,
	`combined_score` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`team_ranking_id`) REFERENCES `team_ranking`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_trr_ranking` ON `team_race_results` (`team_ranking_id`);--> statement-breakpoint
CREATE TABLE `team_race_athletes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_race_result_id` integer NOT NULL,
	`athlete_id` integer DEFAULT 0 NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`pos` integer DEFAULT 0 NOT NULL,
	`scoring` integer DEFAULT 0 NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`team_race_result_id`) REFERENCES `team_race_results`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_tra_result` ON `team_race_athletes` (`team_race_result_id`);--> statement-breakpoint
CREATE INDEX `idx_tra_athlete` ON `team_race_athletes` (`athlete_id`);--> statement-breakpoint
ALTER TABLE `aggregate_athletes` DROP COLUMN `results_json`;--> statement-breakpoint
ALTER TABLE `team_ranking` DROP COLUMN `results_json`;
