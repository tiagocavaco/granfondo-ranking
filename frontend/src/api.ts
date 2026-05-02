
import { eq, desc, asc, inArray, and, sql, max } from "drizzle-orm";
import * as schema from "@granfondo/database/schema";
import { getDb } from "./db/db-client";
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
} from "@granfondo/database/types";

import { normalizeName, normalizeTeam, SOLO_TEAM_KEYS } from "@granfondo/database/normalize";
import { buildCountryMap } from "./utils/athlete";

// In-memory caches populated by initLookups()
let teamAliasesCache = new Map<string, string>();
let nameToIdCache = new Map<string, number>();

function teamNormKey(name: string): string {
  const key = normalizeTeam(name);
  return teamAliasesCache.get(key) ?? key;
}

export function resolveTeamKey(name: string): string {
  return teamNormKey(name);
}

function athleteLookupKey(name: string, team: string): string {
  const nameLower = normalizeName(name);
  const tk = teamNormKey(team ?? "");
  return (!tk || SOLO_TEAM_KEYS.has(tk)) ? `${nameLower}|` : `${nameLower}|${tk}`;
}


function safeJsonArray<T>(json: string): T[] {
  try { return JSON.parse(json) as T[]; } catch { return []; }
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
    const rows = db.select()
      .from(schema.participants)
      .where(eq(schema.participants.eventId, id))
      .orderBy(
        sql`CASE WHEN ${schema.participants.bib} = '' THEN 1 ELSE 0 END`,
        sql`CAST(${schema.participants.bib} AS INTEGER)`,
      )
      .all();
    return rows.map(({ id: _id, eventId: _eventId, ...rest }) => rest);
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
        catPos:       r.catPos,
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
        results:      safeJsonArray(row.resultsJson),
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
        teamKey:      row.teamKey,
        totalPoints:  row.totalPoints,
        eventsScored: row.eventsScored,
        bestRank:     row.bestRank,
        results:      safeJsonArray(row.resultsJson),
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
    } catch (err) {
      console.warn("[api] initLookups failed — athlete profile links will not work:", err);
      throw err;
    }
  },


  async getTopAthletes(limit = 30): Promise<Array<{ id: number; name: string; canonicalTeam: string | null; resultCount: number; country: string }>> {
    const db = await getDb();

    // Count results per athlete (ascending date so last write = most recent country)
    const resultRows = db.select({
      athleteId: schema.athleteResults.athleteId,
      country:   schema.athleteResults.country,
    }).from(schema.athleteResults).orderBy(asc(schema.athleteResults.eventDate)).all();

    const countMap = new Map<number, number>();
    for (const row of resultRows) countMap.set(row.athleteId, (countMap.get(row.athleteId) ?? 0) + 1);
    const countryMap = buildCountryMap(resultRows);

    const topIds = [...countMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);

    if (topIds.length === 0) return [];

    const athleteRows = db.select().from(schema.athletes)
      .where(inArray(schema.athletes.id, topIds))
      .all();

    const athleteById = new Map(athleteRows.map((r) => [r.id, r]));
    return topIds
      .map((id) => {
        const a = athleteById.get(id)!;
        return { id, name: a.name, canonicalTeam: a.canonicalTeam, resultCount: countMap.get(id)!, country: countryMap.get(id) ?? "" };
      })
      .filter((r) => r.name);
  },

  async searchAthletes(search: string): Promise<Array<{ id: number; name: string; canonicalTeam: string | null; resultCount: number; country: string }>> {
    const db = await getDb();
    const term = search.trim();
    if (term.length < 2) return [];

    // sql.js WASM does not include FTS5 — use LIKE on name_lower (fast enough at 14k rows)
    const pattern = `%${term.toLowerCase().replace(/[%_]/g, "\\$&")}%`;
    const rows = db.select()
      .from(schema.athletes)
      .where(sql`${schema.athletes.nameLower} LIKE ${pattern}`)
      .limit(50)
      .all();

    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return [];

    // Count via full select + JS aggregation (ascending date so last write = most recent country)
    const resultRows = db.select().from(schema.athleteResults)
      .where(inArray(schema.athleteResults.athleteId, ids))
      .orderBy(asc(schema.athleteResults.eventDate))
      .all();

    const countMap = new Map<number, number>();
    for (const row of resultRows) countMap.set(row.athleteId, (countMap.get(row.athleteId) ?? 0) + 1);
    const countryMap = buildCountryMap(resultRows);

    return rows
      .map((r) => ({ id: r.id, name: r.name, canonicalTeam: r.canonicalTeam, resultCount: countMap.get(r.id) ?? 0, country: countryMap.get(r.id) ?? "" }))
      .sort((a, b) => b.resultCount - a.resultCount);
  },

  async getTeamByKey(teamKey: string): Promise<{ displayName: string; members: Array<{ id: number; name: string; country: string }> } | null> {
    const db = await getDb();

    const memberRows = db.select({
      id:            schema.athletes.id,
      name:          schema.athletes.name,
      canonicalTeam: schema.athletes.canonicalTeam,
    })
      .from(schema.athleteTeams)
      .innerJoin(schema.athletes, eq(schema.athletes.id, schema.athleteTeams.athleteId))
      .where(eq(schema.athleteTeams.teamKey, teamKey))
      .orderBy(asc(schema.athletes.name))
      .all();

    if (memberRows.length === 0) return null;

    const displayName = memberRows.find((r) => r.canonicalTeam)?.canonicalTeam ?? teamKey;

    const ids = memberRows.map((r) => r.id);
    const countryRows = db.select({ athleteId: schema.athleteResults.athleteId, country: schema.athleteResults.country })
      .from(schema.athleteResults)
      .where(inArray(schema.athleteResults.athleteId, ids))
      .orderBy(asc(schema.athleteResults.eventDate))
      .all();
    const countryMap = buildCountryMap(countryRows);

    return {
      displayName,
      members: memberRows.map((r) => ({ id: r.id, name: r.name, country: countryMap.get(r.id) ?? "" })),
    };
  },
};
