export function mostRecentCountry(
  results: Array<{ country?: string | null }>,
): string {
  return results.find((r) => r.country)?.country ?? "";
}

export function buildCountryMap(
  rows: Array<{ athleteId: number; country: string }>,
): Map<number, string> {
  const map = new Map<number, string>();
  for (const row of rows) {
    if (row.country) {
      map.set(row.athleteId, row.country);
    }
  }
  return map;
}

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
