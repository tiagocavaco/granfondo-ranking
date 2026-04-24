CREATE TABLE `athlete_alias_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`canonical_team` text NOT NULL,
	`aliases_json` text DEFAULT '[]' NOT NULL,
	`note` text
);
--> statement-breakpoint
CREATE TABLE `result_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`bib` text NOT NULL,
	`athlete_id` integer NOT NULL,
	`note` text
);
