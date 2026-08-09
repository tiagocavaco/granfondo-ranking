import { eq, sql, inArray } from "drizzle-orm";
import * as schema from "@granfondo/database/schema";
import { getDb } from "./db.js";

export type AthleteAliasRule = {
  id: number;
  athleteId: number | null;
  name: string;
  canonicalTeam: string;
  note: string | null;
  aliases: Array<{ name: string; team: string }>;
};

export type ResultAssignment = {
  id: number;
  eventId: number;
  eventName: string | null;
  bib: string;
  athleteId: number;
  athleteName: string | null;
  note: string | null;
};

export type BlockedResultEntry = {
  id: number;
  eventId: number;
  eventName: string | null;
  bib: string;
  blockedAthleteId: number;
  blockedAthleteName: string | null;
  note: string | null;
};

export type TeamAliasEntry = {
  id: number;
  canonicalKey: string;
  aliasKeys: string[];
};

export type RawAthlete = {
  id: number;
  name: string;
  nameLower: string;
  canonicalTeam: string | null;
  licences: string[];
  teams: Array<{ id: number; canonicalKey: string }>;
  categories: Array<{ year: number; category: string }>;
  results: Array<{
    eventId: number;
    eventName: string;
    eventDate: string;
    distance: string;
    pos: number;
    genderPos: number;
    finisherCount: number;
    category: string;
    gender: string;
    team: string;
    country: string;
    raceTime: string;
    dnf: number;
    dns: number;
  }>;
};

export type RawTeam = {
  id: number;
  canonicalKey: string;
  aliasKeys: string[];
  athletes: Array<{ id: number; name: string }>;
};

export type RawNameMatch = {
  athleteId: number;
  name: string;
  nameLower: string;
  canonicalTeam: string | null;
  resultCount: number;
};

function parseAliases(json: string): Array<{ name: string; team: string }> {
  try {
    return JSON.parse(json) as Array<{ name: string; team: string }>;
  } catch {
    return [];
  }
}

function parseStringArray(json: string): string[] {
  try {
    return JSON.parse(json) as string[];
  } catch {
    return [];
  }
}

export async function getAthleteAliasRulesForAthlete(
  name: string,
): Promise<AthleteAliasRule[]> {
  const db = await getDb();
  const rows = db
    .select({
      id: schema.athleteAliasRules.id,
      name: schema.athleteAliasRules.name,
      canonicalTeam: schema.athleteAliasRules.canonicalTeam,
      note: schema.athleteAliasRules.note,
      aliasesJson: schema.athleteAliasRules.aliasesJson,
      athleteId: sql<
        number | null
      >`(SELECT id FROM athletes WHERE name = athlete_alias_rules.name LIMIT 1)`,
    })
    .from(schema.athleteAliasRules)
    .where(eq(schema.athleteAliasRules.name, name))
    .all();
  return rows.map((row) => ({
    id: row.id,
    athleteId: row.athleteId,
    name: row.name,
    canonicalTeam: row.canonicalTeam,
    note: row.note ?? null,
    aliases: parseAliases(row.aliasesJson),
  }));
}

export async function getResultAssignmentsForAthlete(
  athleteId: number,
): Promise<ResultAssignment[]> {
  const db = await getDb();
  const rows = db
    .select({
      id: schema.resultAssignments.id,
      eventId: schema.resultAssignments.eventId,
      bib: schema.resultAssignments.bib,
      athleteId: schema.resultAssignments.athleteId,
      note: schema.resultAssignments.note,
      athleteName: schema.athletes.name,
      eventName: schema.events.name,
    })
    .from(schema.resultAssignments)
    .leftJoin(
      schema.athletes,
      eq(schema.athletes.id, schema.resultAssignments.athleteId),
    )
    .leftJoin(
      schema.events,
      eq(schema.events.id, schema.resultAssignments.eventId),
    )
    .where(eq(schema.resultAssignments.athleteId, athleteId))
    .all();
  return rows.map((row) => ({
    id: row.id,
    eventId: row.eventId,
    eventName: row.eventName ?? null,
    bib: row.bib,
    athleteId: row.athleteId,
    athleteName: row.athleteName ?? null,
    note: row.note ?? null,
  }));
}

export async function getAthleteAliasRules(): Promise<AthleteAliasRule[]> {
  const db = await getDb();
  const rows = db
    .select({
      id: schema.athleteAliasRules.id,
      name: schema.athleteAliasRules.name,
      canonicalTeam: schema.athleteAliasRules.canonicalTeam,
      note: schema.athleteAliasRules.note,
      aliasesJson: schema.athleteAliasRules.aliasesJson,
      athleteId: sql<
        number | null
      >`(SELECT id FROM athletes WHERE name = athlete_alias_rules.name LIMIT 1)`,
    })
    .from(schema.athleteAliasRules)
    .orderBy(schema.athleteAliasRules.name)
    .all();

  return rows.map((row) => ({
    id: row.id,
    athleteId: row.athleteId,
    name: row.name,
    canonicalTeam: row.canonicalTeam,
    note: row.note ?? null,
    aliases: parseAliases(row.aliasesJson),
  }));
}

export async function getResultAssignments(): Promise<ResultAssignment[]> {
  const db = await getDb();
  const rows = db
    .select({
      id: schema.resultAssignments.id,
      eventId: schema.resultAssignments.eventId,
      bib: schema.resultAssignments.bib,
      athleteId: schema.resultAssignments.athleteId,
      note: schema.resultAssignments.note,
      athleteName: schema.athletes.name,
      eventName: schema.events.name,
    })
    .from(schema.resultAssignments)
    .leftJoin(
      schema.athletes,
      eq(schema.athletes.id, schema.resultAssignments.athleteId),
    )
    .leftJoin(
      schema.events,
      eq(schema.events.id, schema.resultAssignments.eventId),
    )
    .orderBy(schema.resultAssignments.eventId, schema.resultAssignments.bib)
    .all();

  return rows.map((row) => ({
    id: row.id,
    eventId: row.eventId,
    eventName: row.eventName ?? null,
    bib: row.bib,
    athleteId: row.athleteId,
    athleteName: row.athleteName ?? null,
    note: row.note ?? null,
  }));
}

export async function getTeamAliases(): Promise<TeamAliasEntry[]> {
  const db = await getDb();
  const rows = db
    .select()
    .from(schema.teams)
    .orderBy(schema.teams.canonicalKey)
    .all();

  return rows
    .filter((row) => parseStringArray(row.aliasKeys).length > 0)
    .map((row) => ({
      id: row.id,
      canonicalKey: row.canonicalKey,
      aliasKeys: parseStringArray(row.aliasKeys),
    }));
}

export async function getRawAthlete(id: number): Promise<RawAthlete | null> {
  const db = await getDb();

  const athleteRow = db
    .select()
    .from(schema.athletes)
    .where(eq(schema.athletes.id, id))
    .get();
  if (!athleteRow) return null;

  const teamRows = db
    .select({
      teamId: schema.athleteTeams.teamId,
      canonicalKey: schema.teams.canonicalKey,
    })
    .from(schema.athleteTeams)
    .leftJoin(schema.teams, eq(schema.teams.id, schema.athleteTeams.teamId))
    .where(eq(schema.athleteTeams.athleteId, id))
    .all();

  const categoryRows = db
    .select()
    .from(schema.athleteCategories)
    .where(eq(schema.athleteCategories.athleteId, id))
    .orderBy(schema.athleteCategories.year)
    .all();

  const resultRows = db
    .select()
    .from(schema.athleteResults)
    .where(eq(schema.athleteResults.athleteId, id))
    .orderBy(schema.athleteResults.eventDate)
    .all();

  const licenceRows = db
    .selectDistinct({ licence: schema.resultLicences.licence })
    .from(schema.resultLicences)
    .innerJoin(
      schema.results,
      eq(schema.results.id, schema.resultLicences.resultId),
    )
    .where(eq(schema.results.athleteId, id))
    .all();

  return {
    id: athleteRow.id,
    name: athleteRow.name,
    nameLower: athleteRow.nameLower,
    canonicalTeam: athleteRow.canonicalTeam,
    licences: licenceRows.map((row) => row.licence),
    teams: teamRows.map((row) => ({
      id: row.teamId,
      canonicalKey: row.canonicalKey ?? String(row.teamId),
    })),
    categories: categoryRows.map((row) => ({
      year: row.year,
      category: row.category,
    })),
    results: resultRows.map((row) => ({
      eventId: row.eventId,
      eventName: row.eventName,
      eventDate: row.eventDate,
      distance: row.distance,
      pos: row.pos,
      genderPos: row.genderPos,
      finisherCount: row.finisherCount,
      category: row.category,
      gender: row.gender,
      team: row.team,
      country: row.country,
      raceTime: row.raceTime,
      dnf: row.dnf,
      dns: row.dns,
    })),
  };
}

export async function getRawTeam(
  canonicalKey: string,
): Promise<RawTeam | null> {
  const db = await getDb();

  const teamRow = db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.canonicalKey, canonicalKey))
    .get();
  if (!teamRow) return null;

  const athleteTeamRows = db
    .select({
      athleteId: schema.athleteTeams.athleteId,
      name: schema.athletes.name,
    })
    .from(schema.athleteTeams)
    .leftJoin(
      schema.athletes,
      eq(schema.athletes.id, schema.athleteTeams.athleteId),
    )
    .where(eq(schema.athleteTeams.teamId, teamRow.id))
    .orderBy(schema.athletes.name)
    .all();

  return {
    id: teamRow.id,
    canonicalKey: teamRow.canonicalKey,
    aliasKeys: parseStringArray(teamRow.aliasKeys),
    athletes: athleteTeamRows.map((row) => ({
      id: row.athleteId,
      name: row.name ?? String(row.athleteId),
    })),
  };
}

export type EventMatch = { id: number; name: string; year: number };

export type RawEvent = {
  id: number;
  name: string;
  year: number;
  date: string;
  location: string;
  officialUrl: string | null;
  resultsUrl: string;
  hasResults: boolean;
  participantCount: number;
  finisherCount: number;
  scrapedAt: string | null;
  distances: Array<{ id: string; name: string; resultCount: number }>;
};

export async function getRawEvent(id: number): Promise<RawEvent | null> {
  const db = await getDb();

  const eventRow = db
    .select()
    .from(schema.events)
    .where(eq(schema.events.id, id))
    .get();
  if (!eventRow) return null;

  const distanceRows = db
    .select()
    .from(schema.eventDistances)
    .where(eq(schema.eventDistances.eventId, id))
    .all();

  const resultCountRows = db
    .select({
      distanceId: schema.results.distanceId,
      count: sql<number>`COUNT(*)`,
    })
    .from(schema.results)
    .where(eq(schema.results.eventId, id))
    .groupBy(schema.results.distanceId)
    .all();

  const countByDistance = Object.fromEntries(
    resultCountRows.map((row) => [row.distanceId, row.count]),
  );

  return {
    id: eventRow.id,
    name: eventRow.name,
    year: eventRow.year,
    date: eventRow.date,
    location: eventRow.location,
    officialUrl: eventRow.officialUrl ?? null,
    resultsUrl: eventRow.resultsUrl,
    hasResults: eventRow.hasResults === 1,
    participantCount: eventRow.participantCount,
    finisherCount: eventRow.finisherCount,
    scrapedAt: eventRow.scrapedAt ?? null,
    distances: distanceRows.map((row) => ({
      id: row.id,
      name: row.name,
      resultCount: countByDistance[row.id] ?? 0,
    })),
  };
}

export type RawTeamSummary = { id: number; canonicalKey: string };

export async function listRawTeams(): Promise<RawTeamSummary[]> {
  const db = await getDb();
  return db
    .select({ id: schema.teams.id, canonicalKey: schema.teams.canonicalKey })
    .from(schema.teams)
    .orderBy(schema.teams.id)
    .all();
}

export async function listRawEvents(): Promise<EventMatch[]> {
  const db = await getDb();
  return db
    .select({
      id: schema.events.id,
      name: schema.events.name,
      year: schema.events.year,
    })
    .from(schema.events)
    .orderBy(schema.events.id)
    .all();
}

export async function searchEvents(query: string): Promise<EventMatch[]> {
  const db = await getDb();
  const term = query.trim();
  if (term.length < 2) return [];

  const byId = Number(term);
  if (!isNaN(byId)) {
    const rows = db
      .select({
        id: schema.events.id,
        name: schema.events.name,
        year: schema.events.year,
      })
      .from(schema.events)
      .where(sql`CAST(${schema.events.id} AS TEXT) LIKE ${"%" + term + "%"}`)
      .limit(10)
      .all();
    return rows;
  }

  const pattern = `%${term.toLowerCase().replace(/[%_]/g, "\\$&")}%`;
  const rows = db
    .select({
      id: schema.events.id,
      name: schema.events.name,
      year: schema.events.year,
    })
    .from(schema.events)
    .where(sql`LOWER(${schema.events.name}) LIKE ${pattern}`)
    .orderBy(schema.events.year)
    .limit(15)
    .all();
  return rows;
}

export async function searchTeams(query: string): Promise<string[]> {
  const db = await getDb();
  const term = query.trim();
  if (term.length < 2) return [];

  const pattern = `%${term.toLowerCase().replace(/[%_]/g, "\\$&")}%`;
  const rows = db
    .select({ canonicalKey: schema.teams.canonicalKey })
    .from(schema.teams)
    .where(sql`${schema.teams.canonicalKey} LIKE ${pattern}`)
    .limit(20)
    .all();
  return rows.map((row) => row.canonicalKey);
}

export async function listRawAthletes(): Promise<RawNameMatch[]> {
  const db = await getDb();

  const rows = db
    .select({
      id: schema.athletes.id,
      name: schema.athletes.name,
      nameLower: schema.athletes.nameLower,
      canonicalTeam: schema.athletes.canonicalTeam,
    })
    .from(schema.athletes)
    .orderBy(schema.athletes.id)
    .all();

  if (rows.length === 0) return [];

  const countRows = db
    .select({
      athleteId: schema.athleteResults.athleteId,
      count: sql<number>`COUNT(*)`,
    })
    .from(schema.athleteResults)
    .groupBy(schema.athleteResults.athleteId)
    .all();

  const resultCounts = Object.fromEntries(
    countRows.map((row) => [row.athleteId, row.count]),
  );

  return rows.map((row) => ({
    athleteId: row.id,
    name: row.name,
    nameLower: row.nameLower,
    canonicalTeam: row.canonicalTeam,
    resultCount: resultCounts[row.id] ?? 0,
  }));
}

export async function getBlockedResults(): Promise<BlockedResultEntry[]> {
  const db = await getDb();
  const rows = db
    .select({
      id: schema.blockedResults.id,
      eventId: schema.blockedResults.eventId,
      bib: schema.blockedResults.bib,
      blockedAthleteId: schema.blockedResults.blockedAthleteId,
      note: schema.blockedResults.note,
      blockedAthleteName: schema.athletes.name,
      eventName: schema.events.name,
    })
    .from(schema.blockedResults)
    .leftJoin(
      schema.athletes,
      eq(schema.athletes.id, schema.blockedResults.blockedAthleteId),
    )
    .leftJoin(
      schema.events,
      eq(schema.events.id, schema.blockedResults.eventId),
    )
    .orderBy(schema.blockedResults.blockedAthleteId, schema.blockedResults.eventId)
    .all();

  return rows.map((row) => ({
    id: row.id,
    eventId: row.eventId,
    eventName: row.eventName ?? null,
    bib: row.bib,
    blockedAthleteId: row.blockedAthleteId,
    blockedAthleteName: row.blockedAthleteName ?? null,
    note: row.note ?? null,
  }));
}

export async function searchRawNames(query: string): Promise<RawNameMatch[]> {
  const db = await getDb();
  const term = query.trim();
  if (term.length < 2) return [];

  const pattern = `%${term.toLowerCase().replace(/[%_]/g, "\\$&")}%`;

  const rows = db
    .select({
      id: schema.athletes.id,
      name: schema.athletes.name,
      nameLower: schema.athletes.nameLower,
      canonicalTeam: schema.athletes.canonicalTeam,
    })
    .from(schema.athletes)
    .where(sql`${schema.athletes.nameLower} LIKE ${pattern}`)
    .limit(100)
    .all();

  if (rows.length === 0) return [];

  const athleteIds = rows.map((row) => row.id);
  const resultRows = db
    .select({ athleteId: schema.athleteResults.athleteId })
    .from(schema.athleteResults)
    .where(inArray(schema.athleteResults.athleteId, athleteIds))
    .all();

  const resultCounts = resultRows.reduce(
    (acc, row) => {
      acc[row.athleteId] = (acc[row.athleteId] ?? 0) + 1;
      return acc;
    },
    {} as Record<number, number>,
  );

  return rows.map((row) => ({
    athleteId: row.id,
    name: row.name,
    nameLower: row.nameLower,
    canonicalTeam: row.canonicalTeam,
    resultCount: resultCounts[row.id] ?? 0,
  }));
}
