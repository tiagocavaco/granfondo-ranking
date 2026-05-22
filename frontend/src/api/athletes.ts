import { eq, desc, asc, inArray, sql } from "drizzle-orm";
import * as schema from "@granfondo/database/schema";
import { getDb } from "../db/db-client";
import { initLookups as _initLookups } from "../utils/lookups.js";
import { buildCountryMap } from "../utils/athlete";
import type { AthleteEntry, AthleteResultRef } from "@granfondo/database/types";

export async function getAthlete(id: number): Promise<AthleteEntry> {
  const db = await getDb();

  const athleteRow = db
    .select()
    .from(schema.athletes)
    .where(eq(schema.athletes.id, id))
    .get();
  if (!athleteRow) {
    throw new Error(`Athlete ${id} not found`);
  }

  const resultRows = db
    .select()
    .from(schema.athleteResults)
    .where(eq(schema.athleteResults.athleteId, id))
    .orderBy(desc(schema.athleteResults.eventDate))
    .all();

  const teamRows = db
    .select({ canonicalKey: schema.teams.canonicalKey })
    .from(schema.athleteTeams)
    .innerJoin(schema.teams, eq(schema.teams.id, schema.athleteTeams.teamId))
    .where(eq(schema.athleteTeams.athleteId, id))
    .all();

  const categoryRows = db
    .select()
    .from(schema.athleteCategories)
    .where(eq(schema.athleteCategories.athleteId, id))
    .all();

  const categories: Record<string, string[]> = {};
  for (const cr of categoryRows) {
    const y = String(cr.year);
    if (!categories[y]) {
      categories[y] = [];
    }

    categories[y].push(cr.category);
  }

  const results: AthleteResultRef[] = resultRows.map((r) => ({
    eventId: r.eventId,
    eventName: r.eventName,
    eventDate: r.eventDate,
    eventYear: r.eventYear,
    distance: r.distance,
    pos: r.pos,
    genderPos: r.genderPos,
    catPos: r.catPos,
    finisherCount: r.finisherCount,
    category: r.category,
    gender: r.gender,
    team: r.team,
    country: r.country,
    raceTime: r.raceTime,
    raceTimeSecs: r.raceTimeSecs,
    gap: r.gap,
    gapSecs: r.gapSecs,
    dnf: Boolean(r.dnf),
    dns: Boolean(r.dns),
    bib: "",
  }));

  return {
    id: athleteRow.id,
    name: athleteRow.name,
    nameLower: athleteRow.nameLower,
    canonicalTeam: athleteRow.canonicalTeam ?? undefined,
    teams: teamRows.map((t) => t.canonicalKey),
    categories,
    results,
  };
}

export async function initLookups(): Promise<{ teamsLoaded: boolean }> {
  return _initLookups();
}

export async function getTopAthletes(limit = 30): Promise<
  Array<{
    id: number;
    name: string;
    canonicalTeam: string | null;
    resultCount: number;
    country: string;
  }>
> {
  const db = await getDb();

  // Count results per athlete (ascending date so last write = most recent country)
  const resultRows = db
    .select({
      athleteId: schema.athleteResults.athleteId,
      country: schema.athleteResults.country,
    })
    .from(schema.athleteResults)
    .orderBy(asc(schema.athleteResults.eventDate))
    .all();

  const countMap = new Map<number, number>();
  for (const row of resultRows) {
    countMap.set(row.athleteId, (countMap.get(row.athleteId) ?? 0) + 1);
  }

  const countryMap = buildCountryMap(resultRows);

  const topIds = [...countMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  if (topIds.length === 0) {
    return [];
  }

  const athleteRows = db
    .select()
    .from(schema.athletes)
    .where(inArray(schema.athletes.id, topIds))
    .all();

  const athleteById = new Map(athleteRows.map((r) => [r.id, r]));
  return topIds
    .map((id) => {
      const a = athleteById.get(id)!;
      return {
        id,
        name: a.name,
        canonicalTeam: a.canonicalTeam,
        resultCount: countMap.get(id)!,
        country: countryMap.get(id) ?? "",
      };
    })
    .filter((r) => r.name);
}

export async function searchAthletes(search: string): Promise<
  Array<{
    id: number;
    name: string;
    canonicalTeam: string | null;
    resultCount: number;
    country: string;
  }>
> {
  const db = await getDb();
  const term = search.trim();
  if (term.length < 2) {
    return [];
  }

  // sql.js WASM does not include FTS5 — use LIKE on name_lower / canonical_team (fast enough at 14k rows)
  const pattern = `%${term.toLowerCase().replace(/[%_]/g, "\\$&")}%`;
  const rows = db
    .select()
    .from(schema.athletes)
    .where(
      sql`${schema.athletes.nameLower} LIKE ${pattern} OR lower(${schema.athletes.canonicalTeam}) LIKE ${pattern}`,
    )
    .limit(50)
    .all();

  const ids = rows.map((r) => r.id);
  if (ids.length === 0) {
    return [];
  }

  // Count via full select + JS aggregation (ascending date so last write = most recent country)
  const resultRows = db
    .select()
    .from(schema.athleteResults)
    .where(inArray(schema.athleteResults.athleteId, ids))
    .orderBy(asc(schema.athleteResults.eventDate))
    .all();

  const countMap = new Map<number, number>();
  for (const row of resultRows) {
    countMap.set(row.athleteId, (countMap.get(row.athleteId) ?? 0) + 1);
  }

  const countryMap = buildCountryMap(resultRows);

  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      canonicalTeam: r.canonicalTeam,
      resultCount: countMap.get(r.id) ?? 0,
      country: countryMap.get(r.id) ?? "",
    }))
    .sort((a, b) => b.resultCount - a.resultCount);
}

