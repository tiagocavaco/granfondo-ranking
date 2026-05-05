CREATE TABLE `teams` (
	`id` integer PRIMARY KEY NOT NULL,
	`canonical_key` text NOT NULL,
	`alias_keys` text NOT NULL DEFAULT '[]'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_canonical_key_unique` ON `teams` (`canonical_key`);
--> statement-breakpoint
-- Migrate existing team_aliases: one canonical row with aggregated alias list.
-- SQLite assigns auto-IDs when NULL is inserted into INTEGER PRIMARY KEY.
INSERT INTO `teams` (`id`, `canonical_key`, `alias_keys`)
SELECT NULL, `canonical_key`, json_group_array(`alias_key`)
FROM `team_aliases` GROUP BY `canonical_key`;
--> statement-breakpoint
DROP TABLE `team_aliases`;
--> statement-breakpoint
ALTER TABLE `team_ranking` ADD `team_id` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
-- Replace athlete_teams.team_key TEXT with team_id INTEGER FK
CREATE TABLE `athlete_teams_new` (
	`athlete_id` integer NOT NULL REFERENCES `athletes`(`id`),
	`team_id` integer NOT NULL DEFAULT 0 REFERENCES `teams`(`id`),
	PRIMARY KEY (`athlete_id`, `team_id`)
);
--> statement-breakpoint
INSERT INTO `athlete_teams_new` (`athlete_id`, `team_id`)
SELECT `at`.`athlete_id`, COALESCE(`t`.`id`, 0)
FROM `athlete_teams` `at`
LEFT JOIN `teams` `t` ON `t`.`canonical_key` = `at`.`team_key`;
--> statement-breakpoint
DROP TABLE `athlete_teams`;
--> statement-breakpoint
ALTER TABLE `athlete_teams_new` RENAME TO `athlete_teams`;
--> statement-breakpoint
ALTER TABLE `team_ranking` DROP COLUMN `team_key`;
