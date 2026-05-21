// ── Athlete points table ──────────────────────────────────────────────────────

export const ATHLETE_POINTS_TABLE: Array<{ maxPos: number; points: number }> = [
  { maxPos: 1, points: 75 },
  { maxPos: 2, points: 65 },
  { maxPos: 3, points: 60 },
  { maxPos: 4, points: 55 },
  { maxPos: 5, points: 50 },
  { maxPos: 6, points: 45 },
  { maxPos: 7, points: 40 },
  { maxPos: 8, points: 35 },
  { maxPos: 9, points: 30 },
  { maxPos: 10, points: 25 },
  { maxPos: 11, points: 20 },
  { maxPos: 12, points: 15 },
  { maxPos: 13, points: 13 },
  { maxPos: 14, points: 11 },
  { maxPos: 15, points: 10 },
  { maxPos: 20, points: 7 },
  { maxPos: 25, points: 5 },
  { maxPos: 30, points: 3 },
  { maxPos: 40, points: 2 },
  { maxPos: 50, points: 1 },
];

/** Base points for a finishing position (0 if outside top 50). */
export function posToBasePoints(pos: number): number {
  if (pos < 1) {
    return 0;
  }

  for (const { maxPos, points } of ATHLETE_POINTS_TABLE) {
    if (pos <= maxPos) {
      return points;
    }
  }

  return 0;
}

/**
 * Coefficient that scales points by race size (number of finishers).
 * Reference is 300 finishers = 1.00. sqrt gives a gentle curve:
 *  75 → 0.50,  150 → 0.71,  300 → 1.00,  600 → 1.41,  900 → 1.73
 * Rounded to 2 decimal places.
 */
export const ATHLETE_COEFFICIENT_REFERENCE = 300;

export function finisherCoefficient(finisherCount: number): number {
  const raw = Math.sqrt(
    Math.max(finisherCount, 1) / ATHLETE_COEFFICIENT_REFERENCE,
  );
  return Math.round(raw * 100) / 100;
}

// ── Team points table ─────────────────────────────────────────────────────────

export const TEAM_POINTS_TABLE: Array<{ maxRank: number; points: number }> = [
  { maxRank: 1, points: 25 },
  { maxRank: 2, points: 20 },
  { maxRank: 3, points: 15 },
  { maxRank: 4, points: 12 },
  { maxRank: 5, points: 7 },
  { maxRank: 6, points: 5 },
  { maxRank: 7, points: 4 },
  { maxRank: 8, points: 3 },
  { maxRank: 9, points: 2 },
  { maxRank: 10, points: 1 },
];

/** Base points for a team finishing rank (0 if outside top 10). */
export function rankToTeamBasePoints(rank: number): number {
  for (const { maxRank, points } of TEAM_POINTS_TABLE) {
    if (rank <= maxRank) {
      return points;
    }
  }

  return 0;
}

/**
 * Coefficient based on total number of teams present in the distance.
 * Reference is 80 teams = 1.00.
 */
export const TEAM_COEFFICIENT_REFERENCE = 25;

export function teamCoefficient(totalTeams: number): number {
  const raw = Math.sqrt(Math.max(totalTeams, 1) / TEAM_COEFFICIENT_REFERENCE);
  return Math.round(raw * 100) / 100;
}
