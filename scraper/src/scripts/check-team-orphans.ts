/**
 * check-team-orphans.ts
 *
 * Reports team names that appear in results but don't resolve to any known
 * team (neither canonical key nor alias). These are broken links — clicking
 * on them in the frontend leads nowhere.
 *
 * Usage: npm run db:check-team-orphans
 */

import { openSourceDb } from "../db/db-loader.js";
import { normalizeTeam, SOLO_TEAM_KEYS } from "@granfondo/database/normalize";

const sourceDb = openSourceDb();
if (!sourceDb) {
  console.error("No data.db.enc found — run a scrape first.");
  process.exit(1);
}

const knownKeys = new Set<string>();
const teams = sourceDb.prepare("SELECT canonical_key, alias_keys FROM teams").all() as {
  canonical_key: string;
  alias_keys: string;
}[];
for (const t of teams) {
  knownKeys.add(t.canonical_key);
  for (const a of JSON.parse(t.alias_keys) as string[]) knownKeys.add(a);
}

const rawTeams = sourceDb
  .prepare("SELECT DISTINCT team, COUNT(*) as n FROM results WHERE team != '' GROUP BY team ORDER BY n DESC")
  .all() as { team: string; n: number }[];

const orphaned: { raw: string; normalized: string; count: number }[] = [];
for (const row of rawTeams) {
  const key = normalizeTeam(row.team);
  if (SOLO_TEAM_KEYS.has(key)) continue;
  if (!knownKeys.has(key)) orphaned.push({ raw: row.team, normalized: key, count: row.n });
}

if (orphaned.length === 0) {
  console.log("✓ No orphaned team names found.");
} else {
  console.log("Orphaned team names (in results but not resolvable to any team):\n");
  orphaned
    .sort((a, b) => b.count - a.count)
    .forEach(o => console.log(`${String(o.count).padStart(4)}  ${o.raw}  →  ${o.normalized}`));
  console.log(`\nTotal: ${orphaned.length}`);
}
