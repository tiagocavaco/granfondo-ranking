import { asc } from "drizzle-orm";
import * as schema from "@granfondo/database/schema";
import { getDb } from "./db.js";
import { buildMostFrequentCountryMap } from "./athlete.js";
import type {
  AggregateRanking,
  AggregateAthlete,
  AggregateResult,
  TeamRanking,
  TeamEntry,
  TeamRaceResult,
  TeamRaceAthlete,
} from "@granfondo/database/types";

export async function getAggregateRanking(): Promise<AggregateRanking> {
  const db = await getDb();
  const rows = db
    .select()
    .from(schema.aggregateAthletes)
    .orderBy(
      asc(schema.aggregateAthletes.year),
      asc(schema.aggregateAthletes.distance),
      asc(schema.aggregateAthletes.gender),
      asc(schema.aggregateAthletes.rank),
    )
    .all();

  const aggregateResultRows = db.select().from(schema.aggregateResults).all();
  const resultsByAthlete = new Map<number, AggregateResult[]>();
  for (const row of aggregateResultRows) {
    if (!resultsByAthlete.has(row.aggregateAthleteId)) {
      resultsByAthlete.set(row.aggregateAthleteId, []);
    }
    resultsByAthlete.get(row.aggregateAthleteId)!.push({
      eventId: row.eventId,
      eventName: row.eventName,
      eventDate: row.eventDate,
      distanceFinishers: row.distanceFinishers,
      coefficient: row.coefficient,
      pos: row.pos,
      basePoints: row.basePoints,
      points: row.points,
    });
  }

  const athleteRows = db
    .select({ id: schema.athletes.id, name: schema.athletes.name })
    .from(schema.athletes)
    .all();
  const athleteNameMap = new Map<number, string>(
    athleteRows.map((a) => [a.id, a.name]),
  );

  const countryRows = db
    .select({
      athleteId: schema.athleteResults.athleteId,
      country: schema.athleteResults.country,
    })
    .from(schema.athleteResults)
    .all();
  const countryMap = buildMostFrequentCountryMap(countryRows);

  const ranking: AggregateRanking = {};
  for (const row of rows) {
    const y = String(row.year);
    if (!ranking[y]) ranking[y] = {};
    if (!ranking[y][row.distance]) ranking[y][row.distance] = {};
    if (!ranking[y][row.distance][row.gender]) {
      ranking[y][row.distance][row.gender] = [];
    }

    const athlete: AggregateAthlete = {
      rank: row.rank,
      id: row.athleteId,
      name: athleteNameMap.get(row.athleteId) ?? row.name,
      gender: row.gender,
      team: row.team,
      country: countryMap.get(row.athleteId) ?? row.country,
      totalPoints: row.totalPoints,
      eventsScored: row.eventsScored,
      bestPos: row.bestPos,
      results: resultsByAthlete.get(row.id) ?? [],
    };
    ranking[y][row.distance][row.gender].push(athlete);
  }

  return ranking;
}

export async function getTeamRanking(): Promise<TeamRanking> {
  const db = await getDb();
  const rows = db
    .select()
    .from(schema.teamRanking)
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
    if (!athletesByResult.has(tra.teamRaceResultId)) {
      athletesByResult.set(tra.teamRaceResultId, []);
    }
    athletesByResult.get(tra.teamRaceResultId)!.push({
      id: tra.athleteId,
      name: tra.name,
      pos: tra.pos,
      scoring: Boolean(tra.scoring),
      country: tra.country,
      category: tra.category,
    });
  }

  const resultsByRanking = new Map<number, TeamRaceResult[]>();
  for (const trr of trrRows) {
    if (!resultsByRanking.has(trr.teamRankingId)) {
      resultsByRanking.set(trr.teamRankingId, []);
    }
    resultsByRanking.get(trr.teamRankingId)!.push({
      eventId: trr.eventId,
      eventName: trr.eventName,
      eventDate: trr.eventDate,
      totalTeams: trr.totalTeams,
      eligibleTeams: trr.eligibleTeams,
      coefficient: trr.coefficient,
      teamRank: trr.teamRank,
      basePoints: trr.basePoints,
      points: trr.points,
      combinedScore: trr.combinedScore,
      athletes: athletesByResult.get(trr.id) ?? [],
    });
  }

  const ranking: TeamRanking = {};
  for (const row of rows) {
    const y = String(row.year);
    if (!ranking[y]) ranking[y] = {};
    if (!ranking[y][row.distance]) ranking[y][row.distance] = [];

    const entry: TeamEntry = {
      rank: row.rank,
      team: row.team,
      teamId: row.teamId,
      totalPoints: row.totalPoints,
      eventsScored: row.eventsScored,
      bestRank: row.bestRank,
      results: resultsByRanking.get(row.id) ?? [],
    };
    ranking[y][row.distance].push(entry);
  }

  return ranking;
}
