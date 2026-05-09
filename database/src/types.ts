import type * as schema from "./schema.js";

// ── Raw row aliases (internal — export the composed types below) ──────────────

type EventRow          = typeof schema.events.$inferSelect;
type ResultRow         = typeof schema.results.$inferSelect;
type AthleteRow        = typeof schema.athletes.$inferSelect;
type AthleteResultsRow = typeof schema.athleteResults.$inferSelect;
type AggregateRow      = typeof schema.aggregateAthletes.$inferSelect;
type TeamRow           = typeof schema.teamRanking.$inferSelect;

// ── Participant (stored in DB, returned by frontend) ─────────────────────────

/** Participant row without internal DB columns (id, eventId). athleteId=0 means unlinked. */
export type StoredParticipant = Omit<typeof schema.participants.$inferSelect, "id" | "eventId">;

// ── Event ─────────────────────────────────────────────────────────────────────

export type StoredDistance = Pick<typeof schema.eventDistances.$inferSelect, "id" | "name">;

/** Event row + boolean hasResults + joined distances. */
export type StoredEvent = Omit<EventRow, "hasResults"> & {
  hasResults: boolean;
  distances:  StoredDistance[];
};

// ── Results ───────────────────────────────────────────────────────────────────

/**
 * Result row as returned to the frontend.
 * Strips internal/scope columns (id, eventId, distanceId, distanceName,
 * finisherCount) and converts integer dnf/dns flags to booleans.
 * Adding a column to the `results` schema table automatically widens this type.
 */
export type StoredResult =
  Omit<ResultRow, "id" | "eventId" | "distanceId" | "distanceName" | "finisherCount" | "dnf" | "dns"> & {
    licences: string[];
    dnf:      boolean;
    dns:      boolean;
  };

export interface StoredDistanceResults {
  id:            string;
  name:          string;
  finisherCount: number;
  results:       StoredResult[];
}

export interface StoredEventResults {
  eventId:   number;
  eventName: string;
  eventDate: string;
  eventYear: number;
  scrapedAt: string;
  distances: StoredDistanceResults[];
}

// ── Athletes ──────────────────────────────────────────────────────────────────

/**
 * One race result on an athlete's profile.
 * Strips internal columns (id, athleteId) and converts dnf/dns to booleans.
 * Adding a column to `athlete_results` automatically widens this type.
 */
export type AthleteResultRef =
  Omit<AthleteResultsRow, "id" | "athleteId" | "dnf" | "dns"> & {
    dnf: boolean;
    dns: boolean;
  };

/**
 * Full athlete profile — athlete row + joined teams/categories/results.
 * canonicalTeam is null in DB but exposed as optional string in the API.
 */
export type AthleteEntry =
  Omit<AthleteRow, "canonicalTeam"> & {
    canonicalTeam?: string;
    teams:          string[];
    categories:     Record<string, string[]>; // year → category names
    results:        AthleteResultRef[];
  };

// ── Aggregate ranking ─────────────────────────────────────────────────────────

export interface AggregateResult {
  eventId:           number;
  eventName:         string;
  eventDate:         string;
  distanceFinishers: number;
  coefficient:       number;
  pos:               number;
  basePoints:        number;
  points:            number;
}

/**
 * Aggregate ranking row with results joined from aggregate_results table.
 * Adding a column to `aggregate_athletes` automatically widens this type.
 */
export type AggregateAthlete =
  Omit<AggregateRow, "id" | "athleteId" | "year" | "distance"> & {
    id:      number;              // athleteId from DB
    results: AggregateResult[];
  };

export interface AggregateRanking {
  [year: string]: {
    [distance: string]: {
      [gender: string]: AggregateAthlete[];
    };
  };
}

// ── Team ranking ──────────────────────────────────────────────────────────────

export interface TeamRaceAthlete {
  id:       number;
  name:     string;
  pos:      number;
  scoring:  boolean;
  country:  string;
  category: string;
}

export interface TeamRaceResult {
  eventId:       number;
  eventName:     string;
  eventDate:     string;
  totalTeams:    number;
  eligibleTeams: number;
  coefficient:   number;
  teamRank:      number;
  basePoints:    number;
  points:        number;
  combinedScore: number;
  athletes:      TeamRaceAthlete[];
}

/**
 * Team ranking row with results joined from team_race_results / team_race_athletes tables.
 * Adding a column to `team_ranking` automatically widens this type.
 */
export type TeamEntry =
  Omit<TeamRow, "id" | "year" | "distance"> & {
    teamKey?: string;  // canonical key — used internally by scraper, not persisted to DB
    results: TeamRaceResult[];
  };

export interface TeamRanking {
  [year: string]: {
    [distance: string]: TeamEntry[];
  };
}

// ── Scraper config tables (written by scraper, read back at startup) ──────────

export interface AthleteAliasRule {
  name: string;
  canonicalTeam: string;
  aliases: Array<{ name: string; team: string }>;
  note?: string;
}

export interface ResultAssignment {
  eventId: number;
  bib: string;
  athleteId: number;
  note?: string;
}
