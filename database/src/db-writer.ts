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
import { normalizeTeam, normalizeDistance, SOLO_TEAM_KEYS } from "./normalize.js";
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
  stats: { uniqueAthletes: number; uniqueByYear: Record<string, number>; scrapedAt: string };
  aliasRules: AthleteAliasRule[];
  assignments: ResultAssignment[];
  /** Pre-resolved participant → athlete ID map. Key: "eventId:name:team". 0 = unlinked. */
  participantAthleteIds?: Map<string, number>;
  /** Canonical team key → stable integer ID, seeded from previous DB. */
  teamIdStore: Map<string, number>;
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

  const teamIds = buildTeamIds(data);

  sqlite.transaction(() => {
    insertEvents(db, data);
    insertResults(db, data);
    insertParticipants(db, data);
    insertTeams(db, teamIds, data);
    insertAthletes(db, data, teamIds);
    insertLookups(db, data);
    insertRankings(db, data, teamIds);
    insertStats(db, data);
    insertAliasRules(db, data);
    insertResultAssignments(db, data);
    pruneGhostAthletes(sqlite);
  })();

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
        name:    normalizeDistance(d.name),
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
          distanceName:  normalizeDistance(dist.name),
          finisherCount: dist.finisherCount,
          pos:           r.pos,
          genderPos:     r.genderPos,
          catPos:        r.catPos,
          athleteId:     r.athleteId,
          bib:           r.bib,
          name:          r.name,
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

function insertAthletes(db: ReturnType<typeof drizzle>, data: AllScrapedData, teamIds: Map<string, number>): void {
  for (const entry of data.athletesIndex.values()) {
    db.insert(schema.athletes).values({
      id:            entry.id,
      name:          entry.name,
      nameLower:     entry.nameLower,
      canonicalTeam: entry.canonicalTeam ?? null,
    }).onConflictDoNothing().run();

    for (const team of entry.teams) {
      const teamId = teamIds.get(team) ?? 0;
      db.insert(schema.athleteTeams).values({
        athleteId: entry.id,
        teamId,
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
}

function buildTeamIds(data: AllScrapedData): Map<string, number> {
  const canonicalKeys = new Set<string>();

  for (const entry of data.athletesIndex.values()) {
    for (const tk of entry.teams) {
      if (tk && !SOLO_TEAM_KEYS.has(tk)) canonicalKeys.add(tk);
    }
  }

  // Only include teams that have athletes — avoids ghost rows for aliased-away canonical keys.
  const maxExisting = data.teamIdStore.size > 0 ? Math.max(...data.teamIdStore.values()) : 0;
  let nextId = maxExisting + 1;
  const ids = new Map<string, number>();
  for (const key of canonicalKeys) {
    ids.set(key, data.teamIdStore.get(key) ?? nextId++);
  }
  return ids;
}

function insertTeams(db: ReturnType<typeof drizzle>, teamIds: Map<string, number>, data: AllScrapedData): void {
  // Group alias keys by their canonical
  const aliasByCanonical = new Map<string, string[]>();
  for (const [rawAlias, rawCanonical] of Object.entries(data.teamAliases)) {
    const aliasKey = normalizeTeam(rawAlias);
    const canonicalKey = normalizeTeam(rawCanonical);
    if (!aliasByCanonical.has(canonicalKey)) aliasByCanonical.set(canonicalKey, []);
    aliasByCanonical.get(canonicalKey)!.push(aliasKey);
  }

  for (const [canonicalKey, id] of teamIds) {
    const aliasKeys = aliasByCanonical.get(canonicalKey) ?? [];
    db.insert(schema.teams).values({ id, canonicalKey, aliasKeys: JSON.stringify(aliasKeys) })
      .onConflictDoUpdate({ target: schema.teams.id, set: { canonicalKey, aliasKeys: JSON.stringify(aliasKeys) } })
      .run();
  }
}

function insertRankings(db: ReturnType<typeof drizzle>, data: AllScrapedData, teamIds: Map<string, number>): void {
  for (const [year, distances] of Object.entries(data.aggregateRanking)) {
    for (const [distance, genders] of Object.entries(distances)) {
      for (const [gender, athletes] of Object.entries(genders)) {
        for (const a of athletes) {
          const aggRun = db.insert(schema.aggregateAthletes).values({
            year:         Number(year),
            distance,
            gender,
            rank:         a.rank,
            athleteId:    a.id,
            name:         a.name,
            team:         a.team,
            country:      a.country,
            totalPoints:  a.totalPoints,
            eventsScored: a.eventsScored,
            bestPos:      a.bestPos,
          }).run() as unknown as { lastInsertRowid: bigint };

          const aggId = Number(aggRun.lastInsertRowid);
          for (const r of a.results) {
            db.insert(schema.aggregateResults).values({
              aggregateAthleteId: aggId,
              eventId:            r.eventId,
              eventName:          r.eventName,
              eventDate:          r.eventDate,
              distanceFinishers:  r.distanceFinishers,
              coefficient:        r.coefficient,
              pos:                r.pos,
              basePoints:         r.basePoints,
              points:             r.points,
            }).run();
          }
        }
      }
    }
  }

  for (const [year, distances] of Object.entries(data.teamRanking)) {
    for (const [distance, teams] of Object.entries(distances)) {
      for (const t of teams) {
        const teamRun = db.insert(schema.teamRanking).values({
          year:         Number(year),
          distance,
          rank:         t.rank,
          team:         t.team,
          teamId:       teamIds.get(t.teamKey ?? "") ?? 0,
          totalPoints:  t.totalPoints,
          eventsScored: t.eventsScored,
          bestRank:     t.bestRank,
        }).run() as unknown as { lastInsertRowid: bigint };

        const teamRankId = Number(teamRun.lastInsertRowid);
        for (const r of t.results) {
          const raceRun = db.insert(schema.teamRaceResults).values({
            teamRankingId: teamRankId,
            eventId:       r.eventId,
            eventName:     r.eventName,
            eventDate:     r.eventDate,
            totalTeams:    r.totalTeams,
            eligibleTeams: r.eligibleTeams,
            coefficient:   r.coefficient,
            teamRank:      r.teamRank,
            basePoints:    r.basePoints,
            points:        r.points,
            combinedScore: r.combinedScore,
          }).run() as unknown as { lastInsertRowid: bigint };

          const raceId = Number(raceRun.lastInsertRowid);
          for (const a of r.athletes) {
            db.insert(schema.teamRaceAthletes).values({
              teamRaceResultId: raceId,
              athleteId:        a.id,
              name:             a.name,
              pos:              a.pos,
              scoring:          a.scoring ? 1 : 0,
              country:          a.country,
              category:         a.category,
            }).run();
          }
        }
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

function pruneGhostAthletes(sqlite: BetterSqlite3.Database): void {
  const ghosts = `SELECT id FROM athletes WHERE id NOT IN (SELECT DISTINCT athlete_id FROM athlete_results)`;
  sqlite.prepare(`DELETE FROM athlete_teams      WHERE athlete_id IN (${ghosts})`).run();
  sqlite.prepare(`DELETE FROM athlete_categories WHERE athlete_id IN (${ghosts})`).run();
  sqlite.prepare(`DELETE FROM athlete_lookup     WHERE athlete_id IN (${ghosts})`).run();
  sqlite.prepare(`DELETE FROM athletes           WHERE id         IN (${ghosts})`).run();

  // Remove dangling athlete_id references that can occur when the pipeline merges
  // two profiles and the discarded ID was written to lookup/ranking tables.
  sqlite.prepare("DELETE FROM athlete_lookup     WHERE athlete_id NOT IN (SELECT id FROM athletes)").run();
  sqlite.prepare("DELETE FROM aggregate_athletes WHERE athlete_id NOT IN (SELECT id FROM athletes)").run();
  sqlite.prepare("UPDATE results            SET athlete_id = 0 WHERE athlete_id != 0 AND athlete_id NOT IN (SELECT id FROM athletes)").run();
  sqlite.prepare("UPDATE participants       SET athlete_id = 0 WHERE athlete_id != 0 AND athlete_id NOT IN (SELECT id FROM athletes)").run();
  sqlite.prepare("UPDATE team_race_athletes SET athlete_id = 0 WHERE athlete_id != 0 AND athlete_id NOT IN (SELECT id FROM athletes)").run();

  // Remove lookup keys referencing a team ID that no longer exists — stale entries
  // from teams that were merged away during the pipeline.
  sqlite.prepare(`
    DELETE FROM athlete_lookup
    WHERE SUBSTR(key, INSTR(key, '|') + 1) GLOB '[0-9]*'
      AND CAST(SUBSTR(key, INSTR(key, '|') + 1) AS INTEGER) > 0
      AND CAST(SUBSTR(key, INSTR(key, '|') + 1) AS INTEGER) NOT IN (SELECT id FROM teams)
  `).run();
}


