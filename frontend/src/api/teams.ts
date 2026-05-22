import { eq, inArray, sql } from "drizzle-orm";
import * as schema from "@granfondo/database/schema";
import { getDb } from "../db/db-client";
import { normalizeTeam } from "@granfondo/database/normalize";
import { buildCountryMap } from "../utils/athlete";

function safeJsonArray<T>(json: string): T[] {
  try {
    return JSON.parse(json) as T[];
  } catch {
    return [];
  }
}

type TeamDetail = {
  displayName: string;
  events: Array<{
    eventId: number;
    eventName: string;
    eventDate: string;
    distance: string;
    athletes: Array<{
      id: number;
      name: string;
      pos: number;
      raceTime: string;
      dnf: number;
      dns: number;
      country: string;
      category: string;
    }>;
  }>;
};

export async function getTeamById(id: number): Promise<TeamDetail | null> {
  const db = await getDb();
  const teamRow = db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.id, id))
    .get();
  if (!teamRow) {
    return null;
  }

  return getTeamByKey(teamRow.canonicalKey);
}

export async function getTeamByKey(teamKey: string): Promise<TeamDetail | null> {
  const db = await getDb();

  // Resolve alias and collect all keys for this team (canonical + aliases) in one row
  const teamRow = db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.canonicalKey, teamKey))
    .get();
  const canonicalKey = teamRow?.canonicalKey ?? teamKey;
  const allTeamKeys = teamRow
    ? [canonicalKey, ...safeJsonArray<string>(teamRow.aliasKeys)]
    : [canonicalKey];

  const memberRows = db
    .select({
      id: schema.athletes.id,
      name: schema.athletes.name,
      canonicalTeam: schema.athletes.canonicalTeam,
    })
    .from(schema.athleteTeams)
    .innerJoin(
      schema.athletes,
      eq(schema.athletes.id, schema.athleteTeams.athleteId),
    )
    .where(teamRow ? eq(schema.athleteTeams.teamId, teamRow.id) : sql`0`)
    .all();

  if (memberRows.length === 0) {
    return null;
  }

  const ownKeys = new Set(allTeamKeys);
  const displayName =
    memberRows.find(
      (r) => r.canonicalTeam && ownKeys.has(normalizeTeam(r.canonicalTeam)),
    )?.canonicalTeam ??
    memberRows.find((r) => r.canonicalTeam)?.canonicalTeam ??
    teamKey;
  const seenIds = new Set<number>();
  const ids = memberRows
    .filter((r) => (seenIds.has(r.id) ? false : (seenIds.add(r.id), true)))
    .map((r) => r.id);

  const resultRows = db
    .select({
      athleteId: schema.athleteResults.athleteId,
      eventId: schema.athleteResults.eventId,
      eventName: schema.athleteResults.eventName,
      eventDate: schema.athleteResults.eventDate,
      distance: schema.athleteResults.distance,
      team: schema.athleteResults.team,
      country: schema.athleteResults.country,
      category: schema.athleteResults.category,
      pos: schema.athleteResults.pos,
      raceTime: schema.athleteResults.raceTime,
      dnf: schema.athleteResults.dnf,
      dns: schema.athleteResults.dns,
    })
    .from(schema.athleteResults)
    .where(inArray(schema.athleteResults.athleteId, ids))
    .all();

  const allTeamKeySet = new Set(allTeamKeys);
  const teamResults = resultRows.filter((r) =>
    allTeamKeySet.has(normalizeTeam(r.team)),
  );

  // Per-athlete most-frequent category across their 3 most recent races for this team
  const countryMap = buildCountryMap(teamResults);
  const recentByAthlete = new Map<
    number,
    { date: string; category: string }[]
  >();
  for (const r of teamResults) {
    if (!r.category) {
      continue;
    }

    if (!recentByAthlete.has(r.athleteId)) {
      recentByAthlete.set(r.athleteId, []);
    }

    recentByAthlete
      .get(r.athleteId)!
      .push({ date: r.eventDate, category: r.category });
  }

  const categoryMap = new Map(
    [...recentByAthlete.entries()].map(([id, rows]) => {
      const recent = rows
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 3);
      const freq = new Map<string, number>();
      for (const { category } of recent) {
        freq.set(category, (freq.get(category) ?? 0) + 1);
      }

      return [id, [...freq.entries()].sort((a, b) => b[1] - a[1])[0]![0]];
    }),
  );

  const nameById = new Map(memberRows.map((r) => [r.id, r.name]));
  const eventMap = new Map<string, TeamDetail["events"][0]>();
  for (const r of [...teamResults].sort((a, b) =>
    b.eventDate.localeCompare(a.eventDate),
  )) {
    const key = `${r.eventId}|${r.distance}`;
    if (!eventMap.has(key)) {
      eventMap.set(key, {
        eventId: r.eventId,
        eventName: r.eventName,
        eventDate: r.eventDate,
        distance: r.distance,
        athletes: [],
      });
    }

    eventMap.get(key)!.athletes.push({
      id: r.athleteId,
      name: nameById.get(r.athleteId) ?? "",
      pos: r.pos,
      raceTime: r.raceTime,
      dnf: r.dnf,
      dns: r.dns,
      country: countryMap.get(r.athleteId) ?? "",
      category: categoryMap.get(r.athleteId) ?? "",
    });
  }

  const events = [...eventMap.values()].map((e) => ({
    ...e,
    athletes: e.athletes.sort(
      (a, b) =>
        (a.dnf || a.dns ? 1 : 0) - (b.dnf || b.dns ? 1 : 0) || a.pos - b.pos,
    ),
  }));

  return { displayName, events };
}
