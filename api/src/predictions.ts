import { eq, and, inArray, asc, sql } from "drizzle-orm";
import * as schema from "@granfondo/database/schema";
import { getDb } from "./db.js";
import { isFemaleCategory } from "@granfondo/utils/category";
import { buildCountryMap } from "./athlete.js";
import {
  predictionDistCoeff,
  predictionYearCoeff,
} from "@granfondo/utils/distance";

export { ROAD_DISTANCES, predictionDistCoeff } from "@granfondo/utils/distance";

export interface FavoritePrediction {
  athleteId: number;
  name: string;
  distance: string;
  category: string;
  gender: "M" | "F";
  team: string;
  country: string;
  weightedScore: number;
  raceCount: number;
  mainDistance: string | null;
}

export interface CategoryPredictions {
  ranked: FavoritePrediction[];
  newcomers: number;
}

export interface DistancePredictions {
  overallMale: FavoritePrediction | null;
  overallFemale: FavoritePrediction | null;
  categories: Record<string, CategoryPredictions>;
}

type DistYearEntry = { distance: string; year: number; pts: number };

type Db = Awaited<ReturnType<typeof getDb>>;

interface LinkedRow {
  athleteId: number;
  name: string;
  distance: string;
  category: string;
  team: string;
}

interface NewcomerRow {
  distance: string;
  category: string;
  cnt: number;
}

interface AthleteContext {
  raceCount: Map<number, number>;
  ptsByAthlete: Map<number, DistYearEntry[]>;
  mainDist: Map<number, string>;
  country: Map<number, string>;
}

function computeWeightedScore(
  registeredDist: string,
  entries: DistYearEntry[] | undefined,
  currentYear: number,
): number {
  if (!entries) return 0;
  let total = 0;
  for (const { distance, year, pts } of entries) {
    total +=
      pts *
      predictionDistCoeff(registeredDist, distance) *
      predictionYearCoeff(year, currentYear);
  }
  return total;
}

function loadParticipantRows(
  db: Db,
  eventId: number,
): {
  linkedRows: LinkedRow[];
  newcomerRows: NewcomerRow[];
} {
  const linkedRows = db
    .select({
      athleteId: schema.participants.athleteId,
      name: schema.participants.name,
      distance: schema.participants.distance,
      category: schema.participants.category,
      team: schema.participants.team,
    })
    .from(schema.participants)
    .where(
      and(
        eq(schema.participants.eventId, eventId),
        sql`${schema.participants.athleteId} != 0`,
      ),
    )
    .all();

  const newcomerRows = db
    .select({
      distance: schema.participants.distance,
      category: schema.participants.category,
      cnt: sql<number>`COUNT(*)`,
    })
    .from(schema.participants)
    .where(
      and(
        eq(schema.participants.eventId, eventId),
        eq(schema.participants.athleteId, 0),
      ),
    )
    .groupBy(schema.participants.distance, schema.participants.category)
    .all();

  return { linkedRows, newcomerRows };
}

function loadAthleteContext(db: Db, linkedIds: number[]): AthleteContext {
  const ctx: AthleteContext = {
    raceCount: new Map(),
    ptsByAthlete: new Map(),
    mainDist: new Map(),
    country: new Map(),
  };
  if (linkedIds.length === 0) return ctx;

  const raceCountRows = db
    .select({
      athleteId: schema.athleteResults.athleteId,
      cnt: sql<number>`COUNT(*)`,
    })
    .from(schema.athleteResults)
    .where(inArray(schema.athleteResults.athleteId, linkedIds))
    .groupBy(schema.athleteResults.athleteId)
    .all();
  for (const r of raceCountRows) ctx.raceCount.set(r.athleteId, r.cnt);

  const ptsByDistRows = db
    .select({
      athleteId: schema.aggregateAthletes.athleteId,
      distance: schema.aggregateAthletes.distance,
      year: schema.aggregateAthletes.year,
      pts: sql<number>`SUM(${schema.aggregateAthletes.totalPoints})`,
    })
    .from(schema.aggregateAthletes)
    .where(inArray(schema.aggregateAthletes.athleteId, linkedIds))
    .groupBy(
      schema.aggregateAthletes.athleteId,
      schema.aggregateAthletes.distance,
      schema.aggregateAthletes.year,
    )
    .all();

  const mainDistAccum = new Map<number, Map<string, number>>();
  for (const r of ptsByDistRows) {
    if (!ctx.ptsByAthlete.has(r.athleteId))
      ctx.ptsByAthlete.set(r.athleteId, []);
    ctx.ptsByAthlete
      .get(r.athleteId)!
      .push({ distance: r.distance, year: r.year, pts: r.pts });

    if (!mainDistAccum.has(r.athleteId))
      mainDistAccum.set(r.athleteId, new Map());
    const distanceMap = mainDistAccum.get(r.athleteId)!;
    distanceMap.set(r.distance, (distanceMap.get(r.distance) ?? 0) + r.pts);
  }
  for (const [athleteId, distanceMap] of mainDistAccum) {
    let bestDist: string | null = null;
    let bestPts = -Infinity;
    for (const [dist, pts] of distanceMap) {
      if (pts > bestPts) {
        bestDist = dist;
        bestPts = pts;
      }
    }
    if (bestDist) ctx.mainDist.set(athleteId, bestDist);
  }

  const countryRows = db
    .select({
      athleteId: schema.athleteResults.athleteId,
      country: schema.athleteResults.country,
    })
    .from(schema.athleteResults)
    .where(inArray(schema.athleteResults.athleteId, linkedIds))
    .orderBy(asc(schema.athleteResults.eventDate))
    .all();
  buildCountryMap(countryRows).forEach((v, k) => ctx.country.set(k, v));

  return ctx;
}

function buildPrediction(
  row: LinkedRow,
  ctx: AthleteContext,
  currentYear: number,
): FavoritePrediction {
  const gender: "M" | "F" = isFemaleCategory(row.category) ? "F" : "M";
  return {
    athleteId: row.athleteId,
    name: row.name,
    distance: row.distance,
    category: row.category,
    gender,
    team: row.team,
    country: ctx.country.get(row.athleteId) ?? "PT",
    weightedScore: computeWeightedScore(
      row.distance,
      ctx.ptsByAthlete.get(row.athleteId),
      currentYear,
    ),
    raceCount: ctx.raceCount.get(row.athleteId) ?? 0,
    mainDistance: ctx.mainDist.get(row.athleteId) ?? null,
  };
}

function groupPredictions(
  predictions: FavoritePrediction[],
  newcomerRows: NewcomerRow[],
): Record<string, DistancePredictions> {
  const newcomerMap = new Map<string, number>();
  for (const r of newcomerRows) {
    newcomerMap.set(`${r.distance}|${r.category}`, r.cnt);
  }

  const result: Record<string, DistancePredictions> = {};
  const ensureDist = (distance: string): DistancePredictions => {
    if (!result[distance]) {
      result[distance] = {
        overallMale: null,
        overallFemale: null,
        categories: {},
      };
    }
    return result[distance]!;
  };

  for (const pred of predictions) {
    const distPreds = ensureDist(pred.distance);

    if (pred.weightedScore > 0) {
      if (
        pred.gender === "M" &&
        (!distPreds.overallMale ||
          pred.weightedScore > distPreds.overallMale.weightedScore)
      ) {
        distPreds.overallMale = pred;
      }
      if (
        pred.gender === "F" &&
        (!distPreds.overallFemale ||
          pred.weightedScore > distPreds.overallFemale.weightedScore)
      ) {
        distPreds.overallFemale = pred;
      }
    }

    if (!distPreds.categories[pred.category]) {
      distPreds.categories[pred.category] = {
        ranked: [],
        newcomers: newcomerMap.get(`${pred.distance}|${pred.category}`) ?? 0,
      };
    }
    if (pred.weightedScore > 0) {
      distPreds.categories[pred.category]!.ranked.push(pred);
    } else {
      distPreds.categories[pred.category]!.newcomers += 1;
    }
  }

  // Stable ranked order per category.
  for (const distPreds of Object.values(result)) {
    for (const catPreds of Object.values(distPreds.categories)) {
      catPreds.ranked.sort((a, b) => b.weightedScore - a.weightedScore);
    }
  }

  // Make sure distance/category buckets exist even when all participants in
  // them are newcomers (no linked rows would have populated them above).
  for (const r of newcomerRows) {
    const distPreds = ensureDist(r.distance);
    if (!distPreds.categories[r.category]) {
      distPreds.categories[r.category] = { ranked: [], newcomers: r.cnt };
    }
  }

  return result;
}

export async function getPredictions(
  eventId: number,
): Promise<Record<string, DistancePredictions>> {
  const db = await getDb();
  const currentYear = new Date().getFullYear();

  const { linkedRows, newcomerRows } = loadParticipantRows(db, eventId);
  const linkedIds = [...new Set(linkedRows.map((r) => r.athleteId))];
  const ctx = loadAthleteContext(db, linkedIds);

  const predictions = linkedRows.map((row) =>
    buildPrediction(row, ctx, currentYear),
  );
  return groupPredictions(predictions, newcomerRows);
}
