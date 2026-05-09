
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
  AggregateResult,
  TeamRanking,
  TeamEntry,
  TeamRaceResult,
  TeamRaceAthlete,
  AthleteEntry,
  AthleteResultRef,
} from "@granfondo/database/types";

import { normalizeTeam } from "@granfondo/database/normalize";
import { buildCountryMap } from "./utils/athlete";
import {
  lookupAthleteId as _lookupAthleteId,
  initLookups as _initLookups,
} from "./utils/lookups.js";
export { resolveTeamId, resolveTeamKey } from "./utils/lookups.js";


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
        .orderBy(
          sql`CASE WHEN ${schema.results.dnf} = 1 OR ${schema.results.dns} = 1 THEN 1 ELSE 0 END`,
          asc(schema.results.pos),
        )
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

    const arRows = db.select().from(schema.aggregateResults).all();
    const resultsByAthlete = new Map<number, AggregateResult[]>();
    for (const ar of arRows) {
      if (!resultsByAthlete.has(ar.aggregateAthleteId)) resultsByAthlete.set(ar.aggregateAthleteId, []);
      resultsByAthlete.get(ar.aggregateAthleteId)!.push({
        eventId:           ar.eventId,
        eventName:         ar.eventName,
        eventDate:         ar.eventDate,
        distanceFinishers: ar.distanceFinishers,
        coefficient:       ar.coefficient,
        pos:               ar.pos,
        basePoints:        ar.basePoints,
        points:            ar.points,
      });
    }

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
        gender:       row.gender,
        team:         row.team,
        country:      row.country,
        totalPoints:  row.totalPoints,
        eventsScored: row.eventsScored,
        bestPos:      row.bestPos,
        results:      resultsByAthlete.get(row.id) ?? [],
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

    const trrRows = db.select().from(schema.teamRaceResults).all();
    const traRows = db.select().from(schema.teamRaceAthletes).all();

    const athletesByResult = new Map<number, TeamRaceAthlete[]>();
    for (const tra of traRows) {
      if (!athletesByResult.has(tra.teamRaceResultId)) athletesByResult.set(tra.teamRaceResultId, []);
      athletesByResult.get(tra.teamRaceResultId)!.push({
        id:       tra.athleteId,
        name:     tra.name,
        pos:      tra.pos,
        scoring:  Boolean(tra.scoring),
        country:  tra.country,
        category: tra.category,
      });
    }

    const resultsByRanking = new Map<number, TeamRaceResult[]>();
    for (const trr of trrRows) {
      if (!resultsByRanking.has(trr.teamRankingId)) resultsByRanking.set(trr.teamRankingId, []);
      resultsByRanking.get(trr.teamRankingId)!.push({
        eventId:       trr.eventId,
        eventName:     trr.eventName,
        eventDate:     trr.eventDate,
        totalTeams:    trr.totalTeams,
        eligibleTeams: trr.eligibleTeams,
        coefficient:   trr.coefficient,
        teamRank:      trr.teamRank,
        basePoints:    trr.basePoints,
        points:        trr.points,
        combinedScore: trr.combinedScore,
        athletes:      athletesByResult.get(trr.id) ?? [],
      });
    }

    const ranking: TeamRanking = {};
    for (const row of rows) {
      const y = String(row.year);
      if (!ranking[y]) ranking[y] = {};
      if (!ranking[y][row.distance]) ranking[y][row.distance] = [];

      const entry: TeamEntry = {
        rank:         row.rank,
        team:         row.team,
        teamId:       row.teamId,
        totalPoints:  row.totalPoints,
        eventsScored: row.eventsScored,
        bestRank:     row.bestRank,
        results:      resultsByRanking.get(row.id) ?? [],
      };
      ranking[y][row.distance].push(entry);
    }
    return ranking;
  },

  async getStats(): Promise<{ uniqueAthletes: number; uniqueByYear: Record<string, number>; scrapedAt: string }> {
    const db = await getDb();
    const row = db.select({ value: schema.stats.value })
      .from(schema.stats)
      .where(eq(schema.stats.key, "stats_json"))
      .get();
    if (!row) return { uniqueAthletes: 0, uniqueByYear: {}, scrapedAt: "" };
    return JSON.parse(row.value) as { uniqueAthletes: number; uniqueByYear: Record<string, number>; scrapedAt: string };
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

    const teamRows = db.select({ canonicalKey: schema.teams.canonicalKey })
      .from(schema.athleteTeams)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.athleteTeams.teamId))
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
      teams:         teamRows.map((t) => t.canonicalKey),
      categories,
      results,
    };
  },

  lookupAthleteId(name: string, team: string): number | null {
    return _lookupAthleteId(name, team);
  },

  async initLookups(): Promise<{ teamsLoaded: boolean }> {
    return _initLookups();
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

    // sql.js WASM does not include FTS5 — use LIKE on name_lower / canonical_team (fast enough at 14k rows)
    const pattern = `%${term.toLowerCase().replace(/[%_]/g, "\\$&")}%`;
    const rows = db.select()
      .from(schema.athletes)
      .where(sql`${schema.athletes.nameLower} LIKE ${pattern} OR lower(${schema.athletes.canonicalTeam}) LIKE ${pattern}`)
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

  async getTeamById(id: number): Promise<{
    displayName: string;
    events: Array<{ eventId: number; eventName: string; eventDate: string; distance: string; athletes: Array<{ id: number; name: string; pos: number; raceTime: string; dnf: number; dns: number; country: string; category: string }> }>;
  } | null> {
    const db = await getDb();
    const teamRow = db.select().from(schema.teams).where(eq(schema.teams.id, id)).get();
    if (!teamRow) return null;
    return this.getTeamByKey(teamRow.canonicalKey);
  },

  async getTeamByKey(teamKey: string): Promise<{
    displayName: string;
    events: Array<{ eventId: number; eventName: string; eventDate: string; distance: string; athletes: Array<{ id: number; name: string; pos: number; raceTime: string; dnf: number; dns: number; country: string; category: string }> }>;
  } | null> {
    const db = await getDb();

    // Resolve alias and collect all keys for this team (canonical + aliases) in one row
    const teamRow = db.select().from(schema.teams)
      .where(eq(schema.teams.canonicalKey, teamKey))
      .get();
    const canonicalKey = teamRow?.canonicalKey ?? teamKey;
    const allTeamKeys = teamRow
      ? [canonicalKey, ...(safeJsonArray<string>(teamRow.aliasKeys))]
      : [canonicalKey];

    const memberRows = db.select({
      id:            schema.athletes.id,
      name:          schema.athletes.name,
      canonicalTeam: schema.athletes.canonicalTeam,
    })
      .from(schema.athleteTeams)
      .innerJoin(schema.athletes, eq(schema.athletes.id, schema.athleteTeams.athleteId))
      .where(teamRow ? eq(schema.athleteTeams.teamId, teamRow.id) : sql`0`)
      .all();

    if (memberRows.length === 0) return null;

    const displayName = memberRows.find((r) => r.canonicalTeam)?.canonicalTeam ?? teamKey;
    const seenIds = new Set<number>();
    const ids = memberRows
      .filter((r) => seenIds.has(r.id) ? false : (seenIds.add(r.id), true))
      .map((r) => r.id);

    const resultRows = db.select({
      athleteId:  schema.athleteResults.athleteId,
      eventId:    schema.athleteResults.eventId,
      eventName:  schema.athleteResults.eventName,
      eventDate:  schema.athleteResults.eventDate,
      distance:   schema.athleteResults.distance,
      team:       schema.athleteResults.team,
      country:    schema.athleteResults.country,
      category:   schema.athleteResults.category,
      pos:        schema.athleteResults.pos,
      raceTime:   schema.athleteResults.raceTime,
      dnf:        schema.athleteResults.dnf,
      dns:        schema.athleteResults.dns,
    })
      .from(schema.athleteResults)
      .where(inArray(schema.athleteResults.athleteId, ids))
      .all();

    const allTeamKeySet = new Set(allTeamKeys);
    const teamResults = resultRows.filter((r) => allTeamKeySet.has(normalizeTeam(r.team)));

    // Per-athlete most-frequent category across their 3 most recent races for this team
    const countryMap = buildCountryMap(teamResults);
    const recentByAthlete = new Map<number, { date: string; category: string }[]>();
    for (const r of teamResults) {
      if (!r.category) continue;
      if (!recentByAthlete.has(r.athleteId)) recentByAthlete.set(r.athleteId, []);
      recentByAthlete.get(r.athleteId)!.push({ date: r.eventDate, category: r.category });
    }
    const categoryMap = new Map(
      [...recentByAthlete.entries()].map(([id, rows]) => {
        const recent = rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
        const freq = new Map<string, number>();
        for (const { category } of recent) freq.set(category, (freq.get(category) ?? 0) + 1);
        return [id, [...freq.entries()].sort((a, b) => b[1] - a[1])[0]![0]];
      })
    );

    const nameById = new Map(memberRows.map((r) => [r.id, r.name]));
    const eventMap = new Map<string, { eventId: number; eventName: string; eventDate: string; distance: string; athletes: Array<{ id: number; name: string; pos: number; raceTime: string; dnf: number; dns: number; country: string; category: string }> }>();
    for (const r of [...teamResults].sort((a, b) => b.eventDate.localeCompare(a.eventDate))) {
      const key = `${r.eventId}|${r.distance}`;
      if (!eventMap.has(key)) eventMap.set(key, { eventId: r.eventId, eventName: r.eventName, eventDate: r.eventDate, distance: r.distance, athletes: [] });
      eventMap.get(key)!.athletes.push({
        id: r.athleteId, name: nameById.get(r.athleteId) ?? "",
        pos: r.pos, raceTime: r.raceTime, dnf: r.dnf, dns: r.dns,
        country: countryMap.get(r.athleteId) ?? "", category: categoryMap.get(r.athleteId) ?? "",
      });
    }
    const events = [...eventMap.values()].map((e) => ({
      ...e, athletes: e.athletes.sort((a, b) => (a.dnf || a.dns ? 1 : 0) - (b.dnf || b.dns ? 1 : 0) || a.pos - b.pos),
    }));

    return { displayName, events };
  },
};
