import type BetterSqlite3 from "better-sqlite3";

/**
 * Rewrite athlete_lookup entries after a team alias (fromTeamId → toTeamId) is
 * written, so the next scrape seed finds the same athlete IDs without needing a
 * full rebuild. Only touches keys whose suffix is exactly `|fromTeamId`;
 * solo-collision keys (`|solo:…`) and individual keys (`|`) are untouched.
 *
 * Returns the number of rows updated.
 */
export function rewriteLookupKeysForAlias(
  sqlite: BetterSqlite3.Database,
  fromTeamId: number,
  toTeamId: number,
): number {
  if (fromTeamId === toTeamId) return 0;
  const result = sqlite.prepare(
    `UPDATE athlete_lookup
     SET key = substr(key, 1, instr(key, '|')) || ?
     WHERE key LIKE ? AND key NOT LIKE '%|solo:%'`,
  ).run(String(toTeamId), `%|${fromTeamId}`) as { changes: number };
  return result.changes;
}

/** Load team aliases from the teams table into a Map<aliasKey, canonicalKey>. */
export function loadAliasMap(sqlite: BetterSqlite3.Database): Map<string, string> {
  const rows = sqlite.prepare("SELECT canonical_key, alias_keys FROM teams").all() as { canonical_key: string; alias_keys: string }[];
  const map = new Map<string, string>();
  for (const r of rows) {
    for (const alias of JSON.parse(r.alias_keys) as string[]) map.set(alias, r.canonical_key);
  }
  return map;
}

/** Follow alias chain to ultimate canonical (cycle-safe). */
export function resolveAlias(key: string, aliases: Map<string, string>): string {
  const seen = new Set<string>();
  let cur = key;
  while (aliases.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    cur = aliases.get(cur)!;
  }
  return cur;
}

/**
 * Validate and flatten a proposed alias addition.
 *
 * - Resolves `to` to its ultimate canonical (flattening).
 * - Throws if adding `from → canonical` would create a cycle
 *   (i.e. `from` is reachable from `canonical`).
 *
 * Returns `{ aliasKey, canonicalKey }` ready to write.
 */
export function validateAndFlattenAlias(
  from: string,
  to: string,
  aliases: Map<string, string>,
): { aliasKey: string; canonicalKey: string } {
  const canonicalKey = resolveAlias(to, aliases);

  if (canonicalKey === from) {
    throw new Error(`Cycle: "${from}" is already the canonical for "${to}"`);
  }

  // Simulate the addition and check if canonical eventually leads back to from
  const simulated = new Map(aliases);
  simulated.set(from, canonicalKey);
  const resolved = resolveAlias(canonicalKey, simulated);
  if (resolved === from || simulated.get(resolved) === from) {
    throw new Error(`Adding "${from}" → "${canonicalKey}" would create a cycle`);
  }

  return { aliasKey: from, canonicalKey };
}
