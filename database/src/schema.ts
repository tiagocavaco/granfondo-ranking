/**
 * schema.ts
 *
 * Single source of truth for the SQLite database schema.
 * Defined using Drizzle ORM — run `npm run generate-schema` to emit migrations/.
 * FTS5 virtual tables are not supported by Drizzle and live in db-writer.ts.
 */

import { sqliteTable, text, integer, real, primaryKey, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const events = sqliteTable("events", {
  id:               integer("id").primaryKey(),
  name:             text("name").notNull(),
  year:             integer("year").notNull(),
  date:             text("date").notNull(),
  location:         text("location").notNull().default(""),
  officialUrl:      text("official_url"),
  resultsUrl:       text("results_url").notNull().default(""),
  hasResults:       integer("has_results").notNull().default(0),
  participantCount: integer("participant_count").notNull().default(0),
  finisherCount:    integer("finisher_count").notNull().default(0),
  scrapedAt:        text("scraped_at"),
});

export const eventDistances = sqliteTable("event_distances", {
  id:      text("id").notNull(),
  eventId: integer("event_id").notNull().references(() => events.id),
  name:    text("name").notNull(),
}, (t) => [
  primaryKey({ columns: [t.id, t.eventId] }),
]);

export const results = sqliteTable("results", {
  id:            integer("id").primaryKey({ autoIncrement: true }),
  eventId:       integer("event_id").notNull().references(() => events.id),
  distanceId:    text("distance_id").notNull(),
  distanceName:  text("distance_name").notNull(),
  finisherCount: integer("finisher_count").notNull().default(0),
  pos:           integer("pos").notNull().default(0),
  genderPos:     integer("gender_pos").notNull().default(0),
  catPos:        integer("cat_pos").notNull().default(0),
  athleteId:     integer("athlete_id").notNull().default(0),
  bib:           text("bib").notNull().default(""),
  name:          text("name").notNull(),
  gender:        text("gender").notNull().default(""),
  team:          text("team").notNull().default(""),
  category:      text("category").notNull().default(""),
  country:       text("country").notNull().default(""),
  raceTime:      text("race_time").notNull().default(""),
  raceTimeSecs:  real("race_time_secs").notNull().default(0),
  gap:           text("gap").notNull().default(""),
  gapSecs:       real("gap_secs").notNull().default(0),
  points:        integer("points").notNull().default(0),
  dnf:           integer("dnf").notNull().default(0),
  dns:           integer("dns").notNull().default(0),
}, (t) => [
  index("idx_results_event").on(t.eventId),
  index("idx_results_athlete").on(t.athleteId).where(sql`athlete_id != 0`),
  index("idx_results_filters").on(t.eventId, t.distanceId, t.gender, t.category),
  index("idx_results_pos").on(t.eventId, t.distanceId, t.pos),
]);

export const resultLicences = sqliteTable("result_licences", {
  resultId: integer("result_id").notNull().references(() => results.id),
  licence:  text("licence").notNull(),
}, (t) => [
  primaryKey({ columns: [t.resultId, t.licence] }),
]);

export const participants = sqliteTable("participants", {
  id:         integer("id").primaryKey({ autoIncrement: true }),
  eventId:    integer("event_id").notNull().references(() => events.id),
  bib:        text("bib").notNull().default(""),
  name:       text("name").notNull().default(""),
  fullName:   text("full_name").notNull().default(""),
  gender:     text("gender").notNull().default(""),
  team:       text("team").notNull().default(""),
  category:   text("category").notNull().default(""),
  distance:   text("distance").notNull().default(""),
  distanceId: text("distance_id").notNull().default(""),
  athleteId:  integer("athlete_id").notNull().default(0),
}, (t) => [
  index("idx_participants_event").on(t.eventId),
]);

export const athletes = sqliteTable("athletes", {
  id:            integer("id").primaryKey(),
  name:          text("name").notNull(),
  nameLower:     text("name_lower").notNull(),
  canonicalTeam: text("canonical_team"),
}, (t) => [
  index("idx_athletes_name_lower").on(t.nameLower),
]);

export const athleteTeams = sqliteTable("athlete_teams", {
  athleteId: integer("athlete_id").notNull().references(() => athletes.id),
  teamId:    integer("team_id").notNull().default(0).references(() => teams.id),
}, (t) => [
  primaryKey({ columns: [t.athleteId, t.teamId] }),
]);

export const athleteCategories = sqliteTable("athlete_categories", {
  athleteId: integer("athlete_id").notNull().references(() => athletes.id),
  year:      integer("year").notNull(),
  category:  text("category").notNull(),
}, (t) => [
  primaryKey({ columns: [t.athleteId, t.year, t.category] }),
]);

export const athleteResults = sqliteTable("athlete_results", {
  id:            integer("id").primaryKey({ autoIncrement: true }),
  athleteId:     integer("athlete_id").notNull().references(() => athletes.id),
  eventId:       integer("event_id").notNull(),
  eventName:     text("event_name").notNull(),
  eventDate:     text("event_date").notNull(),
  eventYear:     integer("event_year").notNull(),
  distance:      text("distance").notNull(),
  pos:           integer("pos").notNull().default(0),
  genderPos:     integer("gender_pos").notNull().default(0),
  catPos:        integer("cat_pos").notNull().default(0),
  finisherCount: integer("finisher_count").notNull().default(0),
  category:      text("category").notNull().default(""),
  gender:        text("gender").notNull().default(""),
  team:          text("team").notNull().default(""),
  country:       text("country").notNull().default(""),
  raceTime:      text("race_time").notNull().default(""),
  raceTimeSecs:  real("race_time_secs").notNull().default(0),
  gap:           text("gap").notNull().default(""),
  gapSecs:       real("gap_secs").notNull().default(0),
  dnf:           integer("dnf").notNull().default(0),
  dns:           integer("dns").notNull().default(0),
}, (t) => [
  index("idx_athlete_results_athlete").on(t.athleteId),
]);

export const athleteLookup = sqliteTable("athlete_lookup", {
  key:       text("key").primaryKey(),
  athleteId: integer("athlete_id").notNull(),
});

export const teams = sqliteTable("teams", {
  id:           integer("id").primaryKey(),
  canonicalKey: text("canonical_key").notNull().unique(),
  aliasKeys:    text("alias_keys").notNull().default("[]"),
});

export const aggregateAthletes = sqliteTable("aggregate_athletes", {
  id:           integer("id").primaryKey({ autoIncrement: true }),
  year:         integer("year").notNull(),
  distance:     text("distance").notNull(),
  gender:       text("gender").notNull(),
  rank:         integer("rank").notNull(),
  athleteId:    integer("athlete_id").notNull(),
  name:         text("name").notNull(),
  team:         text("team").notNull().default(""),
  country:      text("country").notNull().default(""),
  totalPoints:  real("total_points").notNull().default(0),
  eventsScored: integer("events_scored").notNull().default(0),
  bestPos:      integer("best_pos").notNull().default(0),
  resultsJson:  text("results_json").notNull().default("[]"),
}, (t) => [
  index("idx_agg_slice").on(t.year, t.distance, t.gender, t.rank),
  index("idx_agg_athlete").on(t.athleteId),
]);

export const teamRanking = sqliteTable("team_ranking", {
  id:           integer("id").primaryKey({ autoIncrement: true }),
  year:         integer("year").notNull(),
  distance:     text("distance").notNull(),
  rank:         integer("rank").notNull(),
  team:         text("team").notNull(),
  teamId:       integer("team_id").notNull().default(0),
  totalPoints:  real("total_points").notNull().default(0),
  eventsScored: integer("events_scored").notNull().default(0),
  bestRank:     integer("best_rank").notNull().default(0),
  resultsJson:  text("results_json").notNull().default("[]"),
}, (t) => [
  index("idx_team_slice").on(t.year, t.distance, t.rank),
]);

export const stats = sqliteTable("stats", {
  key:   text("key").primaryKey(),
  value: text("value").notNull(),
});

export const athleteAliasRules = sqliteTable("athlete_alias_rules", {
  id:            integer("id").primaryKey({ autoIncrement: true }),
  name:          text("name").notNull(),
  canonicalTeam: text("canonical_team").notNull(),
  aliasesJson:   text("aliases_json").notNull().default("[]"),
  note:          text("note"),
});

export const resultAssignments = sqliteTable("result_assignments", {
  id:        integer("id").primaryKey({ autoIncrement: true }),
  eventId:   integer("event_id").notNull(),
  bib:       text("bib").notNull(),
  athleteId: integer("athlete_id").notNull(),
  note:      text("note"),
});
