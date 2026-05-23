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
  if (fromTeamId === toTeamId) {
    return 0;
  }

  const sourceRows = sqlite
    .prepare(
      `SELECT key, athlete_id FROM athlete_lookup WHERE key LIKE ? AND key NOT LIKE '%|solo:%'`,
    )
    .all(`%|${fromTeamId}`) as { key: string; athlete_id: number }[];

  let changes = 0;
  const getTarget = sqlite.prepare<[string], { athlete_id: number }>(
    `SELECT athlete_id FROM athlete_lookup WHERE key = ?`,
  );
  const update = sqlite.prepare(
    `UPDATE athlete_lookup SET key = ? WHERE key = ?`,
  );
  const del = sqlite.prepare(`DELETE FROM athlete_lookup WHERE key = ?`);

  sqlite.transaction(() => {
    for (const { key, athlete_id } of sourceRows) {
      const prefix = key.slice(0, key.lastIndexOf("|") + 1);
      const targetKey = `${prefix}${toTeamId}`;
      const existing = getTarget.get(targetKey);

      if (!existing) {
        update.run(targetKey, key);
      } else if (athlete_id < existing.athlete_id) {
        // Source has the original (lower) ID — replace target
        del.run(targetKey);
        update.run(targetKey, key);
      } else {
        // Target already has a better (lower) ID — drop source
        del.run(key);
      }

      changes++;
    }
  })();

  return changes;
}

/** Load team aliases from the teams table into a Map<aliasKey, canonicalKey>. */
export function loadAliasMap(
  sqlite: BetterSqlite3.Database,
): Map<string, string> {
  const rows = sqlite
    .prepare("SELECT canonical_key, alias_keys FROM teams")
    .all() as {
    canonical_key: string;
    alias_keys: string;
  }[];
  const map = new Map<string, string>();
  for (const r of rows) {
    for (const alias of JSON.parse(r.alias_keys) as string[]) {
      map.set(alias, r.canonical_key);
    }
  }

  return map;
}

/** Follow alias chain to ultimate canonical (cycle-safe). */
export function resolveAlias(
  key: string,
  aliases: Map<string, string>,
): string {
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
  fromKey: string,
  toKey: string,
  aliases: Map<string, string>,
): { aliasKey: string; canonicalKey: string } {
  const canonicalKey = resolveAlias(toKey, aliases);

  if (canonicalKey === fromKey) {
    throw new Error(`Cycle: "${fromKey}" is already the canonical for "${toKey}"`);
  }

  // Simulate the addition and check if canonical eventually leads back to fromKey.
  const simulated = new Map(aliases);
  simulated.set(fromKey, canonicalKey);
  const resolved = resolveAlias(canonicalKey, simulated);
  if (resolved === fromKey || simulated.get(resolved) === fromKey) {
    throw new Error(
      `Adding "${fromKey}" → "${canonicalKey}" would create a cycle`,
    );
  }

  return { aliasKey: fromKey, canonicalKey };
}
