/**
 * compact-athlete-ids.ts
 *
 * Removes ID gaps from both athletes (athletes.id) and teams (teams.id),
 * producing dense 1..N sequences in both tables.
 *
 * Usage: npm run db:compact-ids
 *
 * Phases:
 *   1. Snapshot  — full aggregate_athletes + team_ranking for all year/distance/gender
 *                  combos, plus top-50 per event/distance from results (profile check)
 *   2. Compact   — remaps athlete IDs then team IDs using negative-temp-ID trick
 *   3. Verify    — compares full post-compaction rankings against snapshot; fails loudly
 *   4. Write     — VACUUM, encrypt, overwrite data.db.enc
 */

import * as fs from "fs";
import * as path from "path";
import Database from "better-sqlite3";
import { encryptBuffer, decryptBuffer } from "../db/encrypt.js";

// ── env / paths ────────────────────────────────────────────────────────────────
const envFile = path.join(import.meta.dirname, "../../.env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m) process.env[m[1]] ??= m[2].trim();
  }
}

const keyHex = process.env.DATA_KEY;
if (!keyHex) { console.error("DATA_KEY not set"); process.exit(1); }

const encPath = path.resolve(
  import.meta.dirname,
  "../../../frontend/public/data/data.db.enc",
);

// ── types ──────────────────────────────────────────────────────────────────────
interface AggRow  { year: number; distance: string; gender: string; rank: number; athlete_id: number; name: string; team: string; total_points: number; }
interface TeamRow { year: number; distance: string; rank: number; team: string; team_id: number; total_points: number; events_scored: number; }
interface RaceRow { event_id: number; distance_id: string; pos: number; athlete_id: number; name: string; }

interface Snapshot {
  agg: AggRow[];
  teams: TeamRow[];
  races: RaceRow[];
}

// ── snapshot ───────────────────────────────────────────────────────────────────
function takeSnapshot(db: Database.Database): Snapshot {
  // Full aggregate ranking for all slices (used for complete verification)
  const agg = db.prepare(`
    SELECT year, distance, gender, rank, athlete_id, name, team, total_points
    FROM aggregate_athletes
    ORDER BY year, distance, gender, rank
  `).all() as AggRow[];

  // Full team ranking for all slices
  const teams = db.prepare(`
    SELECT year, distance, rank, team, team_id, total_points, events_scored
    FROM team_ranking
    ORDER BY year, distance, rank
  `).all() as TeamRow[];

  // Top-50 per event/distance with athlete link (profile reachability check)
  const races = db.prepare(`
    SELECT event_id, distance_id, pos, athlete_id, name
    FROM results
    WHERE pos > 0 AND pos <= 50 AND athlete_id != 0
    ORDER BY event_id, distance_id, pos
  `).all() as RaceRow[];

  return { agg, teams, races };
}

// ── compact helper ─────────────────────────────────────────────────────────────
/**
 * Compacts a PK column using a negative-temp-ID strategy.
 * Returns old→new Map (only entries where old !== new).
 *
 * @param db          open writable Database
 * @param idTable     table whose PK to compact (e.g. "athletes")
 * @param pkCol       PK column name (e.g. "id")
 * @param fkTargets   [{table, col}] — FK columns that reference this PK
 */
function compactIds(
  db: Database.Database,
  idTable: string,
  pkCol: string,
  fkTargets: Array<{ table: string; col: string }>,
): Map<number, number> {
  const rows = db.prepare(`SELECT ${pkCol} FROM ${idTable} ORDER BY ${pkCol} ASC`).all() as Record<string, number>[];
  const oldToNew = new Map<number, number>();
  rows.forEach((r, i) => {
    const old = r[pkCol]!;
    const nw = i + 1;
    if (old !== nw) oldToNew.set(old, nw);
  });

  if (oldToNew.size === 0) return oldToNew;

  db.transaction(() => {
    db.exec(`CREATE TEMP TABLE _id_map (old_id INTEGER PRIMARY KEY, new_id INTEGER NOT NULL)`);
    const ins = db.prepare("INSERT INTO _id_map (old_id, new_id) VALUES (?, ?)");
    for (const [o, n] of oldToNew) ins.run(o, n);

    // Step A: negate all affected rows
    db.exec(`UPDATE ${idTable} SET ${pkCol} = -${pkCol} WHERE ${pkCol} IN (SELECT old_id FROM _id_map)`);
    for (const { table, col } of fkTargets) {
      db.exec(`UPDATE ${table} SET ${col} = -${col} WHERE ${col} IN (SELECT old_id FROM _id_map)`);
    }

    // Step B: apply new IDs
    db.exec(`
      UPDATE ${idTable} SET ${pkCol} = (SELECT new_id FROM _id_map WHERE old_id = -${pkCol})
      WHERE ${pkCol} < 0
    `);
    for (const { table, col } of fkTargets) {
      db.exec(`
        UPDATE ${table} SET ${col} = (SELECT new_id FROM _id_map WHERE old_id = -${col})
        WHERE ${col} < 0
      `);
    }

    db.exec("DROP TABLE _id_map");
  })();

  return oldToNew;
}

/**
 * Rewrites athlete_lookup keys that embed team IDs after a team ID compaction.
 * Key format for teamed athletes: "nameLower|teamId" (numeric).
 * Solo/no-team keys use "nameLower|" or "nameLower|solo:..." and are left untouched.
 */
function rewriteAthleteLookupsForTeamRemap(db: Database.Database, teamMap: Map<number, number>): void {
  if (teamMap.size === 0) return;
  db.transaction(() => {
    db.exec(`CREATE TEMP TABLE _tmap (old_id INTEGER PRIMARY KEY, new_id INTEGER NOT NULL)`);
    const ins = db.prepare("INSERT INTO _tmap (old_id, new_id) VALUES (?, ?)");
    for (const [o, n] of teamMap) ins.run(o, n);

    // Stage new keys in a temp table — can't UPDATE in place because new key may
    // collide with an existing key that hasn't been updated yet.
    db.exec(`
      CREATE TEMP TABLE _lookup_rewrite AS
      SELECT
        key AS old_key,
        SUBSTR(key, 1, INSTR(key, '|')) ||
          CAST((SELECT new_id FROM _tmap WHERE old_id = CAST(SUBSTR(key, INSTR(key, '|') + 1) AS INTEGER)) AS TEXT)
          AS new_key,
        athlete_id
      FROM athlete_lookup
      WHERE CAST(SUBSTR(key, INSTR(key, '|') + 1) AS INTEGER) IN (SELECT old_id FROM _tmap)
    `);

    // Delete old keys, then insert with new keys.
    db.exec(`DELETE FROM athlete_lookup WHERE key IN (SELECT old_key FROM _lookup_rewrite)`);
    db.exec(`
      INSERT OR REPLACE INTO athlete_lookup (key, athlete_id)
      SELECT new_key, athlete_id FROM _lookup_rewrite
    `);

    db.exec("DROP TABLE _lookup_rewrite");
    db.exec("DROP TABLE _tmap");
  })();
}

// ── verify ─────────────────────────────────────────────────────────────────────
function verifySnapshot(
  pre: Snapshot,
  post: Snapshot,
  athleteMap: Map<number, number>,
  teamMap: Map<number, number>,
): boolean {
  let ok = true;

  const remapAthlete = (id: number) => athleteMap.get(id) ?? id;
  const remapTeam    = (id: number) => teamMap.get(id) ?? id;

  // 1. Full aggregate ranking
  if (pre.agg.length !== post.agg.length) {
    console.error(`  aggregate_athletes: ${pre.agg.length} pre-rows vs ${post.agg.length} post-rows`);
    ok = false;
  }
  let aggMismatches = 0;
  for (let i = 0; i < Math.min(pre.agg.length, post.agg.length); i++) {
    const p = pre.agg[i]!;
    const q = post.agg[i]!;
    const expId = remapAthlete(p.athlete_id);
    if (q.athlete_id !== expId || q.name !== p.name || q.rank !== p.rank ||
        q.year !== p.year || q.distance !== p.distance || q.gender !== p.gender) {
      if (++aggMismatches <= 5) {
        console.error(
          `  agg mismatch [${p.year} ${p.distance} ${p.gender} rank${p.rank}]: ` +
          `expected id=${expId} ${p.name}, got id=${q.athlete_id} ${q.name}`,
        );
      }
      ok = false;
    }
  }
  if (aggMismatches > 5) console.error(`  ... and ${aggMismatches - 5} more aggregate mismatches`);

  // 2. Full team ranking
  if (pre.teams.length !== post.teams.length) {
    console.error(`  team_ranking: ${pre.teams.length} pre-rows vs ${post.teams.length} post-rows`);
    ok = false;
  }
  let teamMismatches = 0;
  for (let i = 0; i < Math.min(pre.teams.length, post.teams.length); i++) {
    const p = pre.teams[i]!;
    const q = post.teams[i]!;
    const expTeamId = remapTeam(p.team_id);
    if (q.team !== p.team || q.rank !== p.rank || q.total_points !== p.total_points || q.team_id !== expTeamId) {
      if (++teamMismatches <= 5) {
        console.error(
          `  team mismatch [${p.year} ${p.distance} rank${p.rank}]: ` +
          `expected "${p.team}" tid=${expTeamId} pts=${p.total_points}, ` +
          `got "${q.team}" tid=${q.team_id} pts=${q.total_points}`,
        );
      }
      ok = false;
    }
  }
  if (teamMismatches > 5) console.error(`  ... and ${teamMismatches - 5} more team mismatches`);

  // 3. Per-race top-50 profile reachability
  if (pre.races.length !== post.races.length) {
    console.error(`  results top-50: ${pre.races.length} pre-rows vs ${post.races.length} post-rows`);
    ok = false;
  }
  let raceMismatches = 0;
  for (let i = 0; i < Math.min(pre.races.length, post.races.length); i++) {
    const p = pre.races[i]!;
    const q = post.races[i]!;
    const expId = remapAthlete(p.athlete_id);
    if (q.athlete_id !== expId || q.name !== p.name || q.pos !== p.pos) {
      if (++raceMismatches <= 5) {
        console.error(
          `  race mismatch event=${p.event_id} dist=${p.distance_id} pos=${p.pos}: ` +
          `expected id=${expId} ${p.name}, got id=${q.athlete_id} ${q.name}`,
        );
      }
      ok = false;
    }
  }
  if (raceMismatches > 5) console.error(`  ... and ${raceMismatches - 5} more race mismatches`);

  // 4. Gap checks
  const checkGaps = (label: string, table: string, col: string) => {
    const ids = (db_post.prepare(`SELECT ${col} FROM ${table} ORDER BY ${col}`).all() as Record<string, number>[]).map(r => r[col]!);
    for (let i = 0; i < ids.length; i++) {
      if (ids[i] !== i + 1) {
        console.error(`  ${label}: gap found — expected ${i + 1}, found ${ids[i]} at position ${i}`);
        ok = false;
        return;
      }
    }
    console.log(`  ${label}: ${ids.length.toLocaleString()} rows, no gaps (1..${ids[ids.length - 1] ?? 0})`);
  };
  checkGaps("athletes.id", "athletes", "id");
  checkGaps("teams.id", "teams", "id");

  // 5. Orphan checks
  const checks: Array<[string, string]> = [
    ["SELECT COUNT(*) as c FROM athlete_lookup WHERE athlete_id NOT IN (SELECT id FROM athletes)", "athlete_lookup.athlete_id orphans"],
    ["SELECT COUNT(*) as c FROM athlete_results WHERE athlete_id NOT IN (SELECT id FROM athletes)", "athlete_results.athlete_id orphans"],
    ["SELECT COUNT(*) as c FROM results WHERE athlete_id != 0 AND athlete_id NOT IN (SELECT id FROM athletes)", "results.athlete_id orphans"],
    ["SELECT COUNT(*) as c FROM aggregate_athletes WHERE athlete_id NOT IN (SELECT id FROM athletes)", "aggregate_athletes.athlete_id orphans"],
    ["SELECT COUNT(*) as c FROM athlete_teams WHERE athlete_id NOT IN (SELECT id FROM athletes)", "athlete_teams.athlete_id orphans"],
    ["SELECT COUNT(*) as c FROM athlete_teams WHERE team_id NOT IN (SELECT id FROM teams)", "athlete_teams.team_id orphans"],
    ["SELECT COUNT(*) as c FROM team_ranking WHERE team_id NOT IN (SELECT id FROM teams)", "team_ranking.team_id orphans"],
  ];
  for (const [sql, label] of checks) {
    const { c } = db_post.prepare(sql).get() as { c: number };
    if (c > 0) { console.error(`  ${label}: ${c}`); ok = false; }
  }

  return ok;
}

// Need post-compaction db reference in verifySnapshot — hoist it
let db_post: Database.Database;

// ── main ───────────────────────────────────────────────────────────────────────
console.log("=== compact-athlete-ids ===\n");

console.log("Reading data.db.enc...");
const enc = fs.readFileSync(encPath);
const plain = decryptBuffer(enc, keyHex);
const db = new Database(plain);

// Current stats
const aStats = db.prepare("SELECT COUNT(*) as cnt, MAX(id) as max_id FROM athletes").get() as { cnt: number; max_id: number };
const tStats = db.prepare("SELECT COUNT(*) as cnt, MAX(id) as max_id FROM teams").get() as { cnt: number; max_id: number };
const aGaps = aStats.max_id - aStats.cnt;
const tGaps = tStats.max_id - tStats.cnt;
console.log(`Athletes: ${aStats.cnt.toLocaleString()} rows, max ID ${aStats.max_id.toLocaleString()}, ${aGaps.toLocaleString()} gaps`);
console.log(`Teams:    ${tStats.cnt.toLocaleString()} rows, max ID ${tStats.max_id.toLocaleString()}, ${tGaps.toLocaleString()} gaps`);

if (aGaps === 0 && tGaps === 0) {
  console.log("\nNo gaps in athletes or teams — nothing to do.");
  db.close();
  process.exit(0);
}

// Pre-flight: clean up orphaned athlete_teams rows (can exist if a previous partial
// compaction updated athletes.id but missed athlete_teams.athlete_id as a FK target).
// These rows are always safe to delete — the scraper rebuilds them from scratch on
// the next full scrape.
{
  const orphaned = (db.prepare(
    "SELECT COUNT(*) as c FROM athlete_teams WHERE athlete_id NOT IN (SELECT id FROM athletes)",
  ).get() as { c: number }).c;
  if (orphaned > 0) {
    db.prepare("DELETE FROM athlete_teams WHERE athlete_id NOT IN (SELECT id FROM athletes)").run();
    console.log(`Pre-flight: removed ${orphaned.toLocaleString()} orphaned athlete_teams rows (stale from prior incomplete compaction)\n`);
  }
  const orphanedTeam = (db.prepare(
    "SELECT COUNT(*) as c FROM athlete_teams WHERE team_id NOT IN (SELECT id FROM teams)",
  ).get() as { c: number }).c;
  if (orphanedTeam > 0) {
    db.prepare("DELETE FROM athlete_teams WHERE team_id NOT IN (SELECT id FROM teams)").run();
    console.log(`Pre-flight: removed ${orphanedTeam.toLocaleString()} orphaned athlete_teams (team_id) rows\n`);
  }
}

// Phase 1: Snapshot
console.log("\nPhase 1: Taking pre-compaction snapshot...");
const preSnapshot = takeSnapshot(db);
console.log(`  aggregate_athletes: ${preSnapshot.agg.length} rows (all ranks, all slices)`);
console.log(`  team_ranking:       ${preSnapshot.teams.length} rows (all ranks, all slices)`);
console.log(`  results top-50:     ${preSnapshot.races.length} linked rows`);

// Phase 2: Compact
db.pragma("foreign_keys = OFF");
db.pragma("journal_mode = WAL");

let athleteMap = new Map<number, number>();
let teamMap = new Map<number, number>();

if (aGaps > 0) {
  console.log("\nPhase 2a: Compacting athlete IDs...");
  athleteMap = compactIds(db, "athletes", "id", [
    { table: "athlete_results",    col: "athlete_id" },
    { table: "athlete_lookup",     col: "athlete_id" },
    { table: "results",            col: "athlete_id" },
    { table: "aggregate_athletes", col: "athlete_id" },
    { table: "team_race_athletes", col: "athlete_id" },
    { table: "result_assignments", col: "athlete_id" },
    { table: "athlete_teams",      col: "athlete_id" },
  ]);
  console.log(`  Remapped ${athleteMap.size.toLocaleString()} athlete IDs`);
} else {
  console.log("\nPhase 2a: Athletes already dense — skipping.");
}

if (tGaps > 0) {
  console.log("Phase 2b: Compacting team IDs...");
  teamMap = compactIds(db, "teams", "id", [
    { table: "athlete_teams",  col: "team_id" },
    { table: "team_ranking",   col: "team_id" },
  ]);
  console.log(`  Remapped ${teamMap.size.toLocaleString()} team IDs`);
  console.log("  Rewriting athlete_lookup keys...");
  rewriteAthleteLookupsForTeamRemap(db, teamMap);
  const staleKeys = (db.prepare(
    "SELECT COUNT(*) as c FROM athlete_lookup WHERE CAST(SUBSTR(key, INSTR(key, '|') + 1) AS INTEGER) > (SELECT MAX(id) FROM teams) AND SUBSTR(key, INSTR(key, '|') + 1) NOT LIKE 'solo:%' AND SUBSTR(key, INSTR(key, '|') + 1) != ''"
  ).get() as { c: number }).c;
  console.log(`  athlete_lookup keys with out-of-range team ID after rewrite: ${staleKeys}`);
} else {
  console.log("Phase 2b: Teams already dense — skipping.");
}

db.pragma("foreign_keys = ON");

// Phase 3: Verify
console.log("\nPhase 3: Verifying...");
db_post = db;
const postSnapshot = takeSnapshot(db);
const ok = verifySnapshot(preSnapshot, postSnapshot, athleteMap, teamMap);

if (!ok) {
  console.error("\nVerification FAILED — aborting, data.db.enc not overwritten.");
  db.close();
  process.exit(1);
}
console.log("Verification passed.\n");

// Phase 4: VACUUM + write
console.log("Phase 4: VACUUM and writing data.db.enc...");
db.exec("VACUUM");

const serialized = db.serialize();
db.close();

const encrypted = encryptBuffer(Buffer.from(serialized), keyHex);
fs.writeFileSync(encPath, encrypted);

const aNew = aStats.max_id !== aStats.cnt ? aStats.cnt : aStats.max_id;
const tNew = tStats.max_id !== tStats.cnt ? tStats.cnt : tStats.max_id;
console.log(`\nDone. data.db.enc updated (${(encrypted.length / 1024 / 1024).toFixed(1)} MB).`);
if (aGaps > 0) console.log(`Athletes: 1..${aNew.toLocaleString()} (${athleteMap.size.toLocaleString()} remapped)`);
if (tGaps > 0) console.log(`Teams:    1..${tNew.toLocaleString()} (${teamMap.size.toLocaleString()} remapped)`);
