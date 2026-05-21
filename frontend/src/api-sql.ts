/**
 * api-sql.ts
 *
 * SQL-backed implementation of the data API. Drop-in replacement for api-json.ts.
 * Exports the same `api` object with identical function signatures.
 *
 * To activate: flip the export line in api.ts.
 */

import { eq, desc, asc, inArray, like, or, and, sql, max } from "drizzle-orm";
import * as schema from "@granfondo/db/schema";
import { getDb } from "./db-client";
import type {
  StoredEvent,
  StoredEventResults,
  StoredDistanceResults,
  StoredResult,
  StoredParticipant,
  AggregateRanking,
  AggregateAthlete,
  TeamRanking,
  TeamEntry,
  AthleteEntry,
  AthleteResultRef,
} from "@granfondo/db/types";

// ── Normalisation helpers (mirrors api-json.ts) ───────────────────────────────

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[´`\u00b4\u02b9\u02bc\u2018\u2019''']/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTeam(name: string): string {
  let s = name.replace(/([aeiouAEIOU])\^/g, (_, v: string) => {
    const map: Record<string, string> = { a:"â",e:"ê",i:"î",o:"ô",u:"û",A:"Â",E:"Ê",I:"Î",O:"Ô",U:"Û" };
    return map[v] ?? v + "^";
  });
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  s = s.replace(/['''`´\u2018\u2019\u02bc]/g, "");
  s = s.replace(/#/g, "");
  s = s.replace(/[.,]/g, " ");
  s = s.replace(/[/|\\^&+@]/g, " ").replace(/\s*-\s*/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 6; i++) s = s.replace(/(?<![a-z])([a-z]) ([a-z])(?![a-z])/g, "$1$2");
  s = s.replace(/(?<![a-z])([a-z]{1,3}) ([a-z])(?![a-z])/g, "$1$2");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

const SOLO_TEAM_KEYS = new Set(["individual", "independente", "no team", "sem equipa", ""]);

// In-memory caches populated by initLookups()
let teamAliasesCache = new Map<string, string>();
let nameToIdCache = new Map<string, number>();

function teamNormKey(name: string): string {
  const key = normalizeTeam(name);
  return teamAliasesCache.get(key) ?? key;
}

function athleteLookupKey(name: string, team: string): string {
  const nameLower = normalizeName(name);
  const tk = teamNormKey(team ?? "");
  return (!tk || SOLO_TEAM_KEYS.has(tk)) ? `${nameLower}|` : `${nameLower}|${tk}`;
}

// ── FTS search helper ─────────────────────────────────────────────────────────

/** Escapes a user search term for FTS5 MATCH. Returns null if term is empty. */
function ftsMatch(term: string): string | null {
  const t = term.trim();
  if (!t) return null;
  const escaped = t.replace(/["*^]/g, " ").trim();
  if (!escaped) return null;
  return `"${escaped}"*`;
}

// ── API ───────────────────────────────────────────────────────────────────────

export const api = {
  async getEvents(): Promise<StoredEvent[]> {
    const db = await getDb();

    const eventRows = db.select().from(schema.events)
      .orderBy(desc(schema.events.date))
      .all();

    const distRows = db.select().from(schema.eventDistances)
      .orderBy(sql`CAST(${schema.eventDistances.id} AS INTEGER)`)
      .all();

    const distByEvent = new Map<number, Array<{ id: string; name: string }>>();
    for (const d of distRows) {
      if (!distByEvent.has(d.eventId)) distByEvent.set(d.eventId, []);
      distByEvent.get(d.eventId)!.push({ id: d.id, name: d.name });
    }

    return eventRows.map((e) => ({
      id: e.id,
      name: e.name,
      year: e.year,
      date: e.date,
      location: e.location,
      officialUrl: e.officialUrl,
      resultsUrl: e.resultsUrl,
      hasResults: Boolean(e.hasResults),
      distances: distByEvent.get(e.id) ?? [],
      participantCount: e.participantCount,
      finisherCount: e.finisherCount,
      scrapedAt: e.scrapedAt ?? null,
    }));
  },

  async getParticipants(id: number): Promise<StoredParticipant[]> {
    const db = await getDb();
    return db.select({
        bib:        schema.participants.bib,
        name:       schema.participants.name,
        fullName:   schema.participants.fullName,
        gender:     schema.participants.gender,
        team:       schema.participants.team,
        category:   schema.participants.category,
        distance:   schema.participants.distance,
        distanceId: schema.participants.distanceId,
      })
      .from(schema.participants)
      .where(eq(schema.participants.eventId, id))
      .orderBy(
        sql`CASE WHEN ${schema.participants.bib} = '' THEN 1 ELSE 0 END`,
        sql`CAST(${schema.participants.bib} AS INTEGER)`,
      )
      .all();
  },

  async getResults(id: number): Promise<StoredEventResults> {
    const db = await getDb();

    const eventRow = db.select().from(schema.events)
      .where(eq(schema.events.id, id))
      .get();
    if (!eventRow) throw new Error(`Event ${id} not found`);

    // Distinct distances ordered numerically
    const distRows = db.select({
      distanceId:    schema.results.distanceId,
      distanceName:  schema.results.distanceName,
      finisherCount: max(schema.results.finisherCount).as("finisher_count"),
    })
      .from(schema.results)
      .where(eq(schema.results.eventId, id))
      .groupBy(schema.results.distanceId, schema.results.distanceName)
      .orderBy(sql`CAST(${schema.results.distanceId} AS INTEGER)`)
      .all();

    const distances: StoredDistanceResults[] = [];

    for (const dist of distRows) {
      const resultRows = db.select().from(schema.results)
        .where(and(
          eq(schema.results.eventId, id),
          eq(schema.results.distanceId, dist.distanceId),
        ))
        .orderBy(asc(schema.results.pos))
        .all();

      const resultIds = resultRows.map((r) => r.id);
      const licenceRows = resultIds.length > 0
        ? db.select().from(schema.resultLicences)
            .where(inArray(schema.resultLicences.resultId, resultIds))
            .all()
        : [];

      const licencesByResultId = new Map<number, string[]>();
      for (const lr of licenceRows) {
        if (!licencesByResultId.has(lr.resultId)) licencesByResultId.set(lr.resultId, []);
        licencesByResultId.get(lr.resultId)!.push(lr.licence);
      }

      const results: StoredResult[] = resultRows.map((r) => ({
        pos:          r.pos,
        genderPos:    r.genderPos,
        athleteId:    r.athleteId,
        bib:          r.bib,
        name:         r.name,
        nameLower:    r.nameLower,
        gender:       r.gender,
        team:         r.team,
        category:     r.category,
        country:      r.country,
        raceTime:     r.raceTime,
        raceTimeSecs: r.raceTimeSecs,
        gap:          r.gap,
        gapSecs:      r.gapSecs,
        points:       r.points,
        licences:     licencesByResultId.get(r.id) ?? [],
        dnf:          Boolean(r.dnf),
        dns:          Boolean(r.dns),
      }));

      distances.push({
        id:            dist.distanceId,
        name:          dist.distanceName,
        finisherCount: dist.finisherCount ?? 0,
        results,
      });
    }

    return {
      eventId:   eventRow.id,
      eventName: eventRow.name,
      eventDate: eventRow.date,
      eventYear: eventRow.year,
      scrapedAt: eventRow.scrapedAt ?? "",
      distances,
    };
  },

  async getAggregateRanking(): Promise<AggregateRanking> {
    const db = await getDb();
    const rows = db.select().from(schema.aggregateAthletes)
      .orderBy(
        asc(schema.aggregateAthletes.year),
        asc(schema.aggregateAthletes.distance),
        asc(schema.aggregateAthletes.gender),
        asc(schema.aggregateAthletes.rank),
      )
      .all();

    const ranking: AggregateRanking = {};
    for (const row of rows) {
      const y = String(row.year);
      if (!ranking[y]) ranking[y] = {};
      if (!ranking[y][row.distance]) ranking[y][row.distance] = {};
      if (!ranking[y][row.distance][row.gender]) ranking[y][row.distance][row.gender] = [];

      const athlete: AggregateAthlete = {
        rank:         row.rank,
        id:           row.athleteId,
        name:         row.name,
        nameLower:    row.nameLower,
        gender:       row.gender,
        team:         row.team,
        country:      row.country,
        totalPoints:  row.totalPoints,
        eventsScored: row.eventsScored,
        bestPos:      row.bestPos,
        results:      JSON.parse(row.resultsJson),
      };
      ranking[y][row.distance][row.gender].push(athlete);
    }
    return ranking;
  },

  async getTeamRanking(): Promise<TeamRanking> {
    const db = await getDb();
    const rows = db.select().from(schema.teamRanking)
      .orderBy(
        asc(schema.teamRanking.year),
        asc(schema.teamRanking.distance),
        asc(schema.teamRanking.rank),
      )
      .all();

    const ranking: TeamRanking = {};
    for (const row of rows) {
      const y = String(row.year);
      if (!ranking[y]) ranking[y] = {};
      if (!ranking[y][row.distance]) ranking[y][row.distance] = [];

      const entry: TeamEntry = {
        rank:         row.rank,
        team:         row.team,
        totalPoints:  row.totalPoints,
        eventsScored: row.eventsScored,
        bestRank:     row.bestRank,
        results:      JSON.parse(row.resultsJson),
      };
      ranking[y][row.distance].push(entry);
    }
    return ranking;
  },

  async getStats(): Promise<{ uniqueAthletes: number; uniqueByYear: Record<string, number> }> {
    const db = await getDb();
    const row = db.select({ value: schema.stats.value })
      .from(schema.stats)
      .where(eq(schema.stats.key, "stats_json"))
      .get();
    if (!row) return { uniqueAthletes: 0, uniqueByYear: {} };
    return JSON.parse(row.value) as { uniqueAthletes: number; uniqueByYear: Record<string, number> };
  },

  async getAthlete(id: number): Promise<AthleteEntry> {
    const db = await getDb();

    const athleteRow = db.select().from(schema.athletes)
      .where(eq(schema.athletes.id, id))
      .get();
    if (!athleteRow) throw new Error(`Athlete ${id} not found`);

    const resultRows = db.select().from(schema.athleteResults)
      .where(eq(schema.athleteResults.athleteId, id))
      .orderBy(desc(schema.athleteResults.eventDate))
      .all();

    const teamRows = db.select().from(schema.athleteTeams)
      .where(eq(schema.athleteTeams.athleteId, id))
      .all();

    const categoryRows = db.select().from(schema.athleteCategories)
      .where(eq(schema.athleteCategories.athleteId, id))
      .all();

    const categories: Record<string, string[]> = {};
    for (const cr of categoryRows) {
      const y = String(cr.year);
      if (!categories[y]) categories[y] = [];
      categories[y].push(cr.category);
    }

    const results: AthleteResultRef[] = resultRows.map((r) => ({
      eventId:       r.eventId,
      eventName:     r.eventName,
      eventDate:     r.eventDate,
      eventYear:     r.eventYear,
      distance:      r.distance,
      pos:           r.pos,
      genderPos:     r.genderPos,
      finisherCount: r.finisherCount,
      category:      r.category,
      gender:        r.gender,
      team:          r.team,
      country:       r.country,
      raceTime:      r.raceTime,
      raceTimeSecs:  r.raceTimeSecs,
      gap:           r.gap,
      gapSecs:       r.gapSecs,
      dnf:           Boolean(r.dnf),
      dns:           Boolean(r.dns),
    }));

    return {
      id:            athleteRow.id,
      name:          athleteRow.name,
      nameLower:     athleteRow.nameLower,
      canonicalTeam: athleteRow.canonicalTeam ?? undefined,
      teams:         teamRows.map((t) => t.teamKey),
      categories,
      results,
    };
  },

  lookupAthleteId(name: string, team: string): number | null {
    return nameToIdCache.get(athleteLookupKey(name, team)) ?? null;
  },

  async initLookups(): Promise<void> {
    try {
      const db = await getDb();

      const aliasRows = db.select().from(schema.teamAliases).all();
      teamAliasesCache = new Map(aliasRows.map((r) => [r.aliasKey, r.canonicalKey]));

      const lookupRows = db.select().from(schema.athleteLookup).all();
      nameToIdCache = new Map(lookupRows.map((r) => [r.key, r.athleteId]));
    } catch {
      // non-fatal: athlete navigation degrades gracefully
    }
  },

  /** Search results for an event/distance — used by RankingsTab. */
  async searchResults(
    eventId: number,
    distanceId: string,
    search: string,
  ): Promise<StoredResult[]> {
    const db = await getDb();
    const match = ftsMatch(search);

    const baseCondition = and(
      eq(schema.results.eventId, eventId),
      eq(schema.results.distanceId, distanceId),
    );

    const searchCondition = match
      ? or(
          sql`${schema.results.id} IN (SELECT rowid FROM results_fts WHERE results_fts MATCH ${match})`,
          like(schema.results.bib, `${search.trim()}%`),
        )
      : undefined;

    const resultRows = db.select().from(schema.results)
      .where(and(baseCondition, searchCondition))
      .orderBy(asc(schema.results.pos))
      .all();

    const resultIds = resultRows.map((r) => r.id);
    const licenceRows = resultIds.length > 0
      ? db.select().from(schema.resultLicences)
          .where(inArray(schema.resultLicences.resultId, resultIds))
          .all()
      : [];

    const licencesByResultId = new Map<number, string[]>();
    for (const lr of licenceRows) {
      if (!licencesByResultId.has(lr.resultId)) licencesByResultId.set(lr.resultId, []);
      licencesByResultId.get(lr.resultId)!.push(lr.licence);
    }

    return resultRows.map((r) => ({
      pos:          r.pos,
      genderPos:    r.genderPos,
      athleteId:    r.athleteId,
      bib:          r.bib,
      name:         r.name,
      nameLower:    r.nameLower,
      gender:       r.gender,
      team:         r.team,
      category:     r.category,
      country:      r.country,
      raceTime:     r.raceTime,
      raceTimeSecs: r.raceTimeSecs,
      gap:          r.gap,
      gapSecs:      r.gapSecs,
      points:       r.points,
      licences:     licencesByResultId.get(r.id) ?? [],
      dnf:          Boolean(r.dnf),
      dns:          Boolean(r.dns),
    }));
  },
};
