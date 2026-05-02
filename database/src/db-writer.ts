/**
 * db-writer.ts
 *
 * Builds an in-memory SQLite database from all scraped data and returns it as
 * a serialised Buffer ready for AES-GCM encryption.
 */

import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sql } from "drizzle-orm";
import * as path from "path";
import * as schema from "./schema.js";
import { normalizeTeam } from "./normalize.js";
import type {
  StoredEvent,
  StoredEventResults,
  StoredParticipant,
  AthleteEntry,
  AggregateRanking,
  TeamRanking,
  AthleteAliasRule,
  ResultAssignment,
} from "./types.js";

export interface AllScrapedData {
  events: StoredEvent[];
  allResults: Map<number, StoredEventResults>;
  allParticipants: Map<number, StoredParticipant[]>;
  athletesIndex: Map<string, AthleteEntry>;
  nameToId: Record<string, number>;
  teamAliases: Record<string, string>;
  aggregateRanking: AggregateRanking;
  teamRanking: TeamRanking;
  stats: { uniqueAthletes: number; uniqueByYear: Record<string, number> };
  aliasRules: AthleteAliasRule[];
  assignments: ResultAssignment[];
  /** Pre-resolved participant → athlete ID map. Key: "eventId:name:team". 0 = unlinked. */
  participantAthleteIds?: Map<string, number>;
}

export function buildDatabase(data: AllScrapedData): Buffer {
  const sqlite = new BetterSqlite3(":memory:");
  sqlite.pragma("synchronous = OFF");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  // Apply Drizzle-managed schema (tables + indexes)
  migrate(db, {
    migrationsFolder: path.join(import.meta.dirname, "..", "migrations"),
  });

  // FTS5 virtual tables — not supported by Drizzle, applied via raw SQL
  sqlite.exec(`
    CREATE VIRTUAL TABLE results_fts USING fts5(
      name, team, bib UNINDEXED,
      content='results', content_rowid='id', tokenize='unicode61'
    );
    CREATE VIRTUAL TABLE participants_fts USING fts5(
      full_name, team, bib UNINDEXED,
      content='participants', content_rowid='id', tokenize='unicode61'
    );
    CREATE VIRTUAL TABLE athletes_fts USING fts5(
      name, canonical_team,
      content='athletes', content_rowid='id', tokenize='unicode61'
    );
    CREATE VIRTUAL TABLE aggregate_fts USING fts5(
      name, team,
      content='aggregate_athletes', content_rowid='id', tokenize='unicode61'
    );
  `);

  sqlite.transaction(() => {
    insertEvents(db, data);
    insertResults(db, data);
    insertParticipants(db, data);
    insertAthletes(db, data);
    insertLookups(db, data);
    insertRankings(db, data);
    insertStats(db, data);
    insertAliasRules(db, data);
    insertResultAssignments(db, data);
  })();

  buildFTS(sqlite);

  return sqlite.serialize() as Buffer;
}

// ── Insert helpers ────────────────────────────────────────────────────────────

function insertEvents(db: ReturnType<typeof drizzle>, data: AllScrapedData): void {
  for (const e of data.events) {
    db.insert(schema.events).values({
      id:               e.id,
      name:             e.name,
      year:             e.year,
      date:             e.date,
      location:         e.location ?? "",
      officialUrl:      e.officialUrl ?? null,
      resultsUrl:       e.resultsUrl,
      hasResults:       e.hasResults ? 1 : 0,
      participantCount: e.participantCount,
      finisherCount:    e.finisherCount,
      scrapedAt:        e.scrapedAt ?? null,
    }).run();

    for (const d of e.distances) {
      db.insert(schema.eventDistances).values({
        id:      d.id,
        eventId: e.id,
        name:    d.name,
      }).onConflictDoNothing().run();
    }
  }
}

function insertResults(db: ReturnType<typeof drizzle>, data: AllScrapedData): void {
  for (const [eventId, evResults] of data.allResults) {
    for (const dist of evResults.distances) {
      for (const r of dist.results) {
        // better-sqlite3 run() returns { lastInsertRowid } synchronously
        const run = db.insert(schema.results).values({
          eventId,
          distanceId:    dist.id,
          distanceName:  dist.name,
          finisherCount: dist.finisherCount,
          pos:           r.pos,
          genderPos:     r.genderPos,
          catPos:        r.catPos,
          athleteId:     r.athleteId,
          bib:           r.bib,
          name:          r.name,
          nameLower:     r.nameLower,
          gender:        r.gender,
          team:          r.team,
          category:      r.category,
          country:       r.country,
          raceTime:      r.raceTime,
          raceTimeSecs:  r.raceTimeSecs,
          gap:           r.gap,
          gapSecs:       r.gapSecs,
          points:        r.points,
          dnf:           r.dnf ? 1 : 0,
          dns:           r.dns ? 1 : 0,
        }).run() as unknown as { lastInsertRowid: bigint };

        const resultId = Number(run.lastInsertRowid);
        for (const lic of r.licences) {
          db.insert(schema.resultLicences).values({
            resultId,
            licence: lic,
          }).onConflictDoNothing().run();
        }
      }
    }
  }
}

function insertParticipants(db: ReturnType<typeof drizzle>, data: AllScrapedData): void {
  for (const [eventId, athletes] of data.allParticipants) {
    for (const a of athletes) {
      const athleteId = data.participantAthleteIds?.get(`${eventId}:${a.name}:${a.team}`) ?? 0;
      db.insert(schema.participants).values({ eventId, ...a, athleteId }).run();
    }
  }
}

function insertAthletes(db: ReturnType<typeof drizzle>, data: AllScrapedData): void {
  for (const entry of data.athletesIndex.values()) {
    db.insert(schema.athletes).values({
      id:            entry.id,
      name:          entry.name,
      nameLower:     entry.nameLower,
      canonicalTeam: entry.canonicalTeam ?? null,
    }).onConflictDoNothing().run();

    for (const team of entry.teams) {
      db.insert(schema.athleteTeams).values({
        athleteId: entry.id,
        teamKey:   team,
      }).onConflictDoNothing().run();
    }

    for (const [year, cats] of Object.entries(entry.categories)) {
      for (const cat of cats) {
        db.insert(schema.athleteCategories).values({
          athleteId: entry.id,
          year:      Number(year),
          category:  cat,
        }).onConflictDoNothing().run();
      }
    }

    for (const r of entry.results) {
      db.insert(schema.athleteResults).values({
        athleteId:     entry.id,
        eventId:       r.eventId,
        eventName:     r.eventName,
        eventDate:     r.eventDate,
        eventYear:     r.eventYear,
        distance:      r.distance,
        pos:           r.pos,
        genderPos:     r.genderPos,
        catPos:        r.catPos,
        finisherCount: r.finisherCount,
        category:      r.category,
        gender:        r.gender,
        team:          r.team,
        country:       r.country,
        raceTime:      r.raceTime,
        raceTimeSecs:  r.raceTimeSecs,
        gap:           r.gap,
        gapSecs:       r.gapSecs,
        dnf:           r.dnf ? 1 : 0,
        dns:           r.dns ? 1 : 0,
      }).run();
    }
  }
}

function insertLookups(db: ReturnType<typeof drizzle>, data: AllScrapedData): void {
  for (const [key, athleteId] of Object.entries(data.nameToId)) {
    db.insert(schema.athleteLookup).values({ key, athleteId })
      .onConflictDoUpdate({ target: schema.athleteLookup.key, set: { athleteId } })
      .run();
  }
  for (const [rawAlias, rawCanonical] of Object.entries(data.teamAliases)) {
    const aliasKey = normalizeTeam(rawAlias);
    const canonicalKey = normalizeTeam(rawCanonical);
    db.insert(schema.teamAliases).values({ aliasKey, canonicalKey })
      .onConflictDoUpdate({ target: schema.teamAliases.aliasKey, set: { canonicalKey } })
      .run();
  }
}

function insertRankings(db: ReturnType<typeof drizzle>, data: AllScrapedData): void {
  for (const [year, distances] of Object.entries(data.aggregateRanking)) {
    for (const [distance, genders] of Object.entries(distances)) {
      for (const [gender, athletes] of Object.entries(genders)) {
        for (const a of athletes) {
          db.insert(schema.aggregateAthletes).values({
            year:         Number(year),
            distance,
            gender,
            rank:         a.rank,
            athleteId:    a.id,
            name:         a.name,
            nameLower:    a.nameLower,
            team:         a.team,
            country:      a.country,
            totalPoints:  a.totalPoints,
            eventsScored: a.eventsScored,
            bestPos:      a.bestPos,
            resultsJson:  JSON.stringify(a.results),
          }).run();
        }
      }
    }
  }

  for (const [year, distances] of Object.entries(data.teamRanking)) {
    for (const [distance, teams] of Object.entries(distances)) {
      for (const t of teams) {
        db.insert(schema.teamRanking).values({
          year:         Number(year),
          distance,
          rank:         t.rank,
          team:         t.team,
          teamKey:      t.teamKey,
          totalPoints:  t.totalPoints,
          eventsScored: t.eventsScored,
          bestRank:     t.bestRank,
          resultsJson:  JSON.stringify(t.results),
        }).run();
      }
    }
  }
}

function insertStats(db: ReturnType<typeof drizzle>, data: AllScrapedData): void {
  db.insert(schema.stats).values({ key: "stats_json", value: JSON.stringify(data.stats) })
    .onConflictDoUpdate({ target: schema.stats.key, set: { value: sql`excluded.value` } })
    .run();
}

function insertAliasRules(db: ReturnType<typeof drizzle>, data: AllScrapedData): void {
  for (const rule of data.aliasRules) {
    db.insert(schema.athleteAliasRules).values({
      name:          rule.name,
      canonicalTeam: rule.canonicalTeam,
      aliasesJson:   JSON.stringify(rule.aliases),
      note:          rule.note ?? null,
    }).run();
  }
}

function insertResultAssignments(db: ReturnType<typeof drizzle>, data: AllScrapedData): void {
  for (const a of data.assignments) {
    db.insert(schema.resultAssignments).values({
      eventId:   a.eventId,
      bib:       a.bib,
      athleteId: a.athleteId,
      note:      a.note ?? null,
    }).run();
  }
}

// ── FTS population ────────────────────────────────────────────────────────────

function buildFTS(sqlite: BetterSqlite3.Database): void {
  sqlite.exec(`INSERT INTO results_fts(rowid, name, team, bib) SELECT id, name, team, bib FROM results`);
  sqlite.exec(`INSERT INTO participants_fts(rowid, full_name, team, bib) SELECT id, full_name, team, bib FROM participants`);
  sqlite.exec(`INSERT INTO athletes_fts(rowid, name, canonical_team) SELECT id, name, COALESCE(canonical_team, '') FROM athletes`);
  sqlite.exec(`INSERT INTO aggregate_fts(rowid, name, team) SELECT id, name, team FROM aggregate_athletes`);
}
