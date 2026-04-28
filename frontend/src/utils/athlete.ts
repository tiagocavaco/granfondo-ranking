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
