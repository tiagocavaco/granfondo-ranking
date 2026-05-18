export const DISTANCES = ["Granfondo", "Mediofondo", "Minifondo", "Time Trial"];

/** Road distances in display order (excludes Time Trial). */
export const ROAD_DISTANCES = ["Granfondo", "Mediofondo", "Minifondo"];

export const DISTANCE_ABBR: Record<string, string> = {
  Granfondo: "GF", Mediofondo: "MF", Minifondo: "Mini", "Time Trial": "TT",
};

const DIST_RANK: Record<string, number> = {
  Granfondo: 0, Mediofondo: 1, Minifondo: 2, "Time Trial": 3,
};

/** Sort key for a distance name — lower value sorts first. Unknown → 9. */
export function distancePriority(name: string): number {
  return DIST_RANK[name] ?? 9;
}

const PRED_DIST_STEP = 0.2;
export const PRED_YEAR_STEP = 0.1;

/**
 * Prediction scoring coefficient: how much historical points from `historical`
 * count toward predicting performance at `registered` distance.
 *
 * Same distance = 1.0. Each step shorter than registered = +0.2 bonus
 * (longer-distance history transfers down well). Each step longer = −0.2 penalty.
 * Time Trial is isolated: only counts 1.0 if both distances are Time Trial, else 0.
 */
export function predictionDistCoeff(registered: string, historical: string): number {
  if (registered === "Time Trial" || historical === "Time Trial")
    return registered === historical ? 1.0 : 0;
  const r = DIST_RANK[registered];
  const h = DIST_RANK[historical];
  if (r === undefined || h === undefined) return registered === historical ? 1.0 : 0;
  return 1.0 + (r - h) * PRED_DIST_STEP;
}

/**
 * Prediction year decay coefficient. Current year = 1.0, each prior year loses 0.1.
 * Results from 10+ years ago contribute nothing.
 */
export function predictionYearCoeff(year: number, currentYear: number): number {
  return Math.max(0, 1.0 - (currentYear - year) * PRED_YEAR_STEP);
}
