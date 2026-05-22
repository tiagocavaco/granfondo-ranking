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

export async function getPredictions(
  eventId: number,
): Promise<Record<string, DistancePredictions>> {
  const db = await getDb();
  const currentYear = new Date().getFullYear();

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

  const linkedIds = [...new Set(linkedRows.map((r) => r.athleteId))];

  const raceCountMap = new Map<number, number>();
  if (linkedIds.length > 0) {
    const raceCountRows = db
      .select({
        athleteId: schema.athleteResults.athleteId,
        cnt: sql<number>`COUNT(*)`,
      })
      .from(schema.athleteResults)
      .where(inArray(schema.athleteResults.athleteId, linkedIds))
      .groupBy(schema.athleteResults.athleteId)
      .all();
    for (const r of raceCountRows) {
      raceCountMap.set(r.athleteId, r.cnt);
    }
  }

  const ptsByAthlete = new Map<number, DistYearEntry[]>();
  const mainDistPts = new Map<number, { dist: string; pts: number }>();
  if (linkedIds.length > 0) {
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
      if (!ptsByAthlete.has(r.athleteId)) ptsByAthlete.set(r.athleteId, []);
      ptsByAthlete
        .get(r.athleteId)!
        .push({ distance: r.distance, year: r.year, pts: r.pts });

      if (!mainDistAccum.has(r.athleteId)) {
        mainDistAccum.set(r.athleteId, new Map());
      }
      const dm = mainDistAccum.get(r.athleteId)!;
      dm.set(r.distance, (dm.get(r.distance) ?? 0) + r.pts);
    }

    for (const [athleteId, dm] of mainDistAccum) {
      let best: { dist: string; pts: number } | null = null;
      for (const [dist, pts] of dm) {
        if (!best || pts > best.pts) best = { dist, pts };
      }
      if (best) mainDistPts.set(athleteId, best);
    }
  }

  const countryMap = new Map<number, string>();
  if (linkedIds.length > 0) {
    const countryRows = db
      .select({
        athleteId: schema.athleteResults.athleteId,
        country: schema.athleteResults.country,
      })
      .from(schema.athleteResults)
      .where(inArray(schema.athleteResults.athleteId, linkedIds))
      .orderBy(asc(schema.athleteResults.eventDate))
      .all();
    buildCountryMap(countryRows).forEach((v, k) => countryMap.set(k, v));
  }

  const newcomerMap = new Map<string, number>();
  for (const r of newcomerRows) {
    newcomerMap.set(`${r.distance}|${r.category}`, r.cnt);
  }

  const result: Record<string, DistancePredictions> = {};

  for (const row of linkedRows) {
    const { athleteId, name, distance, category, team } = row;
    const gender: "M" | "F" = isFemaleCategory(category) ? "F" : "M";
    const mainDistance = mainDistPts.get(athleteId)?.dist ?? null;
    const country = countryMap.get(athleteId) ?? "PT";
    const raceCount = raceCountMap.get(athleteId) ?? 0;
    const weightedScore = computeWeightedScore(
      distance,
      ptsByAthlete.get(athleteId),
      currentYear,
    );

    const pred: FavoritePrediction = {
      athleteId,
      name,
      distance,
      category,
      gender,
      team,
      country,
      weightedScore,
      raceCount,
      mainDistance,
    };

    if (!result[distance]) {
      result[distance] = { overallMale: null, overallFemale: null, categories: {} };
    }
    const distPreds = result[distance]!;

    if (weightedScore > 0) {
      if (gender === "M" && (!distPreds.overallMale || weightedScore > distPreds.overallMale.weightedScore)) {
        distPreds.overallMale = pred;
      }
      if (gender === "F" && (!distPreds.overallFemale || weightedScore > distPreds.overallFemale.weightedScore)) {
        distPreds.overallFemale = pred;
      }
    }

    if (!distPreds.categories[category]) {
      distPreds.categories[category] = {
        ranked: [],
        newcomers: newcomerMap.get(`${distance}|${category}`) ?? 0,
      };
    }
    if (weightedScore > 0) {
      distPreds.categories[category]!.ranked.push(pred);
    } else {
      distPreds.categories[category]!.newcomers += 1;
    }
  }

  for (const distPreds of Object.values(result)) {
    for (const catPreds of Object.values(distPreds.categories)) {
      catPreds.ranked.sort((a, b) => b.weightedScore - a.weightedScore);
    }
  }

  for (const r of newcomerRows) {
    if (!result[r.distance]) {
      result[r.distance] = { overallMale: null, overallFemale: null, categories: {} };
    }
    if (!result[r.distance]!.categories[r.category]) {
      result[r.distance]!.categories[r.category] = { ranked: [], newcomers: r.cnt };
    }
  }

  return result;
}
