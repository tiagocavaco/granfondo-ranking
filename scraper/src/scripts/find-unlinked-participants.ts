/**
 * find-unlinked-participants.ts
 *
 * For each unlinked participant, checks if there's an athlete_lookup entry
 * with the same normalized name but a different team key. Groups these by
 * (participant team key → existing athlete team key) and counts occurrences,
 * so likely missing aliases surface at the top.
 *
 * Usage: npm run db:find-unlinked --prefix scraper
 */

import BetterSqlite3 from "better-sqlite3";
import { normalizeName, teamNormalKey, teamKeySimilarity, initTeamAliases } from "../normalize.js";
import { decryptBuffer } from "../db/encrypt.js";
import { DB_ENC_PATH } from "../paths.js";
import fs from "fs";
import path from "path";

const plain = decryptBuffer(fs.readFileSync(DB_ENC_PATH), process.env.DATA_KEY!);
const tmpPath = "/tmp/granfondo_unlinked.db";
fs.writeFileSync(tmpPath, plain);
const db = new BetterSqlite3(tmpPath);

const aliases: Record<string, string> = {};
for (const r of db.prepare("SELECT canonical_key, alias_keys FROM teams").all() as { canonical_key: string; alias_keys: string }[]) {
  for (const alias of JSON.parse(r.alias_keys) as string[]) aliases[alias] = r.canonical_key;
}
initTeamAliases(aliases);

// Build name → [team keys] index from athlete_lookup
const nameToTeams = new Map<string, Set<string>>();
for (const row of db.prepare("SELECT key FROM athlete_lookup").all() as any[]) {
  const [namePart, teamPart] = (row.key as string).split("|");
  if (!namePart) continue;
  if (!nameToTeams.has(namePart)) nameToTeams.set(namePart, new Set());
  nameToTeams.get(namePart)!.add(teamPart ?? "");
}

const participants = db.prepare("SELECT name, team, athlete_id FROM participants").all() as any[];
db.close();
try { fs.unlinkSync(tmpPath); } catch {}

// For unlinked participants, find name matches with different team
// Group by (participant team key → closest existing team key) pair
const pairCounts = new Map<string, { from: string; to: string; count: number; names: Set<string> }>();

for (const p of participants) {
  const nameLower = normalizeName(p.name);
  const teamKey   = teamNormalKey(p.team);

  if (p.athlete_id && p.athlete_id !== 0) continue; // already linked
  const existingTeams = nameToTeams.get(nameLower);
  if (!existingTeams) continue;           // name not in DB at all — new athlete
  if (existingTeams.has(teamKey)) continue; // team already in lookup

  // Find the best-matching existing team for this name
  let bestTeam = "";
  let bestSim  = 0;
  for (const et of existingTeams) {
    if (!et) continue;
    const sim = teamKeySimilarity(teamKey, et);
    if (sim > bestSim) { bestSim = sim; bestTeam = et; }
  }

  if (bestSim < 0.6 || !bestTeam) continue; // too dissimilar — probably a different athlete with same name

  const pairKey = `${teamKey}|||${bestTeam}`;
  if (!pairCounts.has(pairKey)) {
    pairCounts.set(pairKey, { from: teamKey, to: bestTeam, count: 0, names: new Set() });
  }
  const entry = pairCounts.get(pairKey)!;
  entry.count++;
  entry.names.add(nameLower);
}

// Sort by count descending
const sorted = [...pairCounts.values()]
  .filter(e => e.count >= 2) // at least 2 athletes affected
  .sort((a, b) => b.count - a.count);

console.log(`${sorted.length} potential team alias pairs (≥2 athletes affected):\n`);
for (const e of sorted) {
  console.log(`  [${e.count}x]  "${e.from}" → "${e.to}"`);
}

// Write as candidates file
const outPath = path.resolve(import.meta.dirname, "../../team-alias-candidates.json");
let existing: any[] = [];
if (fs.existsSync(outPath)) {
  try { existing = JSON.parse(fs.readFileSync(outPath, "utf-8")); } catch {}
}
const rejectedKeys = new Set(existing.filter(c => c.approved === false).map((c: any) => `${c.from}|||${c.to}`));

const candidates = sorted
  .filter(e => !rejectedKeys.has(`${e.from}|||${e.to}`))
  .map(e => ({ from: e.from, to: e.to, count: e.count, approved: null }));

fs.writeFileSync(outPath, JSON.stringify(candidates, null, 2));
console.log(`\n✓ ${candidates.length} candidates written to scraper/team-alias-candidates.json`);
