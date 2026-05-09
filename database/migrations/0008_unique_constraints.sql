CREATE UNIQUE INDEX `uq_athlete_results_race` ON `athlete_results` (`athlete_id`,`event_id`,`distance`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_agg_athlete_slice` ON `aggregate_athletes` (`year`,`distance`,`gender`,`athlete_id`);
