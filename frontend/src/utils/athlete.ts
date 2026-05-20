/**
 * Returns the country from the most recent result in an array already sorted
 * descending by date (i.e. results[0] is the newest). Falls back to the first
 * non-empty country if the newest has none.
 */
export function mostRecentCountry(results: Array<{ country?: string | null }>): string {
  return results.find((r) => r.country)?.country ?? "";
}

/**
 * Builds an athleteId → country map from a flat list of result rows, keeping
 * the most recent (last-seen when iterating ascending by date) country per athlete.
 */
export function buildCountryMap(
  rows: Array<{ athleteId: number; country: string }>,
): Map<number, string> {
  const map = new Map<number, string>();
  for (const row of rows) {
    if (row.country) map.set(row.athleteId, row.country);
  }
  return map;
}

/**
 * Builds an athleteId → country map using the most-frequently-occurring country
 * across all results. More robust than most-recent when a single event has a
 * wrong or missing nationality (e.g. a result that defaults to PT).
 */
export function buildMostFrequentCountryMap(
  rows: Array<{ athleteId: number; country: string }>,
): Map<number, string> {
  const counts = new Map<number, Map<string, number>>();
  for (const row of rows) {
    if (!row.country) continue;
    if (!counts.has(row.athleteId)) counts.set(row.athleteId, new Map());
    const m = counts.get(row.athleteId)!;
    m.set(row.country, (m.get(row.country) ?? 0) + 1);
  }
  const map = new Map<number, string>();
  for (const [athleteId, m] of counts) {
    const best = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) map.set(athleteId, best[0]);
  }
  return map;
}
