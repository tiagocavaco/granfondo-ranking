/**
 * check-post-scrape.ts
 *
 * Validates DB integrity after a scrape:
 *   - No gaps in athletes.id or teams.id
 *   - No orphaned references in athlete_lookup, athlete_teams, team_ranking
 *   - Athlete and team counts
 *   - Top-3 rankings per slice (for quick human review)
 *
 * Usage: npm run db:check-post-scrape
 *        Pass --snapshot to write pre-scrape baseline to /tmp/pre-scrape-snapshot.json
 *        Pass --verify  to compare against saved baseline
 */

import * as fs from "fs";
import * as path from "path";
import Database from "better-sqlite3";
import { decryptBuffer } from "../db/encrypt.js";

const envFile = path.join(import.meta.dirname, "../../.env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m) process.env[m[1]] ??= m[2].trim();
  }
}

const keyHex = process.env.DATA_KEY;
if (!keyHex) { console.error("DATA_KEY not set"); process.exit(1); }

const encPath = path.resolve(import.meta.dirname, "../../../frontend/public/data/data.db.enc");
const snapshotPath = "/tmp/pre-scrape-snapshot.json";

const mode = process.argv.includes("--verify") ? "verify"
           : process.argv.includes("--snapshot") ? "snapshot"
           : "report";

const enc = fs.readFileSync(encPath);
const db = new Database(decryptBuffer(enc, keyHex));

// ── counts + ID range checks ───────────────────────────────────────────────────
function checkGaps(table: string, col: string): { count: number; maxId: number; gaps: number } {
  const { cnt, max_id } = db.prepare(`SELECT COUNT(*) as cnt, MAX(${col}) as max_id FROM ${table}`).get() as any;
  return { count: cnt, maxId: max_id, gaps: max_id - cnt };
}

const athletes = checkGaps("athletes", "id");
const teams    = checkGaps("teams", "id");

console.log("=== DB integrity check ===\n");
console.log(`Athletes: ${athletes.count.toLocaleString()} rows, max ID ${athletes.maxId?.toLocaleString()}, gaps: ${athletes.gaps}`);
console.log(`Teams:    ${teams.count.toLocaleString()} rows, max ID ${teams.maxId?.toLocaleString()}, gaps: ${teams.gaps}`);

// ── orphan checks ──────────────────────────────────────────────────────────────
const orphans: Record<string, number> = {
  "athlete_lookup.athlete_id": (db.prepare("SELECT COUNT(*) as c FROM athlete_lookup WHERE athlete_id NOT IN (SELECT id FROM athletes)").get() as any).c,
  "athlete_teams.athlete_id":  (db.prepare("SELECT COUNT(*) as c FROM athlete_teams WHERE athlete_id NOT IN (SELECT id FROM athletes)").get() as any).c,
  "athlete_teams.team_id":     (db.prepare("SELECT COUNT(*) as c FROM athlete_teams WHERE team_id NOT IN (SELECT id FROM teams)").get() as any).c,
  "team_ranking.team_id":      (db.prepare("SELECT COUNT(*) as c FROM team_ranking WHERE team_id NOT IN (SELECT id FROM teams)").get() as any).c,
  "results.athlete_id":        (db.prepare("SELECT COUNT(*) as c FROM results WHERE athlete_id != 0 AND athlete_id NOT IN (SELECT id FROM athletes)").get() as any).c,
  "aggregate_athletes.athlete_id": (db.prepare("SELECT COUNT(*) as c FROM aggregate_athletes WHERE athlete_id NOT IN (SELECT id FROM athletes)").get() as any).c,
};

console.log("\nOrphan checks:");
let anyOrphans = false;
for (const [label, count] of Object.entries(orphans)) {
  const ok = count === 0;
  console.log(`  ${ok ? "✓" : "✗"} ${label}: ${count}`);
  if (!ok) anyOrphans = true;
}

// ── top-3 rankings ─────────────────────────────────────────────────────────────
const top3 = db.prepare(`
  SELECT year, distance, gender, rank, athlete_id, name, total_points
  FROM aggregate_athletes WHERE rank <= 3
  ORDER BY year, distance, gender, rank
`).all() as any[];

const teamTop3 = db.prepare(`
  SELECT year, distance, rank, team, team_id, total_points
  FROM team_ranking WHERE rank <= 3
  ORDER BY year, distance, rank
`).all() as any[];

if (mode === "snapshot") {
  fs.writeFileSync(snapshotPath, JSON.stringify({ athletes, teams, top3, teamTop3 }, null, 2));
  console.log(`\nSnapshot written to ${snapshotPath}`);
  db.close();
  process.exit(anyOrphans ? 1 : 0);
}

if (mode === "verify") {
  if (!fs.existsSync(snapshotPath)) {
    console.error(`\nNo snapshot found at ${snapshotPath} — run with --snapshot first`);
    db.close();
    process.exit(1);
  }
  const pre = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
  let ok = true;

  if (pre.athletes.count !== athletes.count) {
    console.error(`\n✗ Athlete count changed: ${pre.athletes.count} → ${athletes.count}`);
    ok = false;
  } else {
    console.log(`\n✓ Athlete count unchanged: ${athletes.count.toLocaleString()}`);
  }
  if (pre.teams.count !== teams.count) {
    console.error(`✗ Team count changed: ${pre.teams.count} → ${teams.count}`);
    ok = false;
  } else {
    console.log(`✓ Team count unchanged: ${teams.count.toLocaleString()}`);
  }

  // Compare top-3 rankings
  let rankMismatches = 0;
  for (let i = 0; i < Math.max(pre.top3.length, top3.length); i++) {
    const p = pre.top3[i];
    const q = top3[i];
    if (!p || !q || p.athlete_id !== q.athlete_id || p.name !== q.name || p.rank !== q.rank ||
        p.total_points !== q.total_points) {
      if (++rankMismatches <= 5) {
        console.error(`✗ Agg rank mismatch [${p?.year} ${p?.distance} ${p?.gender} rank${p?.rank}]: ` +
          `pre: id=${p?.athlete_id} ${p?.name} pts=${p?.total_points} | ` +
          `post: id=${q?.athlete_id} ${q?.name} pts=${q?.total_points}`);
      }
      ok = false;
    }
  }
  if (rankMismatches === 0) console.log(`✓ Aggregate top-3 unchanged across all slices`);
  else if (rankMismatches > 5) console.error(`  ... and ${rankMismatches - 5} more`);

  let teamMismatches = 0;
  for (let i = 0; i < Math.max(pre.teamTop3.length, teamTop3.length); i++) {
    const p = pre.teamTop3[i];
    const q = teamTop3[i];
    if (!p || !q || p.team !== q.team || p.rank !== q.rank || p.total_points !== q.total_points || p.team_id !== q.team_id) {
      if (++teamMismatches <= 5) {
        console.error(`✗ Team rank mismatch [${p?.year} ${p?.distance} rank${p?.rank}]: ` +
          `pre: "${p?.team}" tid=${p?.team_id} pts=${p?.total_points} | ` +
          `post: "${q?.team}" tid=${q?.team_id} pts=${q?.total_points}`);
      }
      ok = false;
    }
  }
  if (teamMismatches === 0) console.log(`✓ Team top-3 unchanged across all slices`);
  else if (teamMismatches > 5) console.error(`  ... and ${teamMismatches - 5} more`);

  db.close();
  process.exit(ok && !anyOrphans ? 0 : 1);
}

// ── report mode: just print top-3 ─────────────────────────────────────────────
console.log(`\nAggregate top-3 (${top3.length} rows across all slices):`);
let lastSlice = "";
for (const r of top3) {
  const slice = `${r.year} ${r.distance} ${r.gender}`;
  if (slice !== lastSlice) { console.log(`\n  [${slice}]`); lastSlice = slice; }
  console.log(`    ${r.rank}. ${r.name} (id=${r.athlete_id}) — ${r.total_points} pts`);
}

console.log(`\nTeam top-3 (${teamTop3.length} rows across all slices):`);
lastSlice = "";
for (const r of teamTop3) {
  const slice = `${r.year} ${r.distance}`;
  if (slice !== lastSlice) { console.log(`\n  [${slice}]`); lastSlice = slice; }
  console.log(`    ${r.rank}. ${r.team} (tid=${r.team_id}) — ${r.total_points} pts`);
}

db.close();
process.exit(anyOrphans ? 1 : 0);
