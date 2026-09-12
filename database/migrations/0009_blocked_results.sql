CREATE TABLE `blocked_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`bib` text NOT NULL,
	`blocked_athlete_id` integer NOT NULL,
	`note` text
);
