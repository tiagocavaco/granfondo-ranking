/**
 * apply-split-reviews.ts
 *
 * Reads split-candidates.json and for every entry with "approved": true:
 *
 *   - absorb has a real team → adds an athlete alias rule (Pass 4 handles it)
 *   - absorb is solo (team="") OR keep is solo → adds result assignments for
 *     every result the absorb athlete owns (alias rules are skipped for solo
 *     athletes in Pass 4; assignments always win)
 *
 * Usage:
 *   npm run db:apply-splits
 *
 * Then run `npm run scrape` to rebuild the DB with the new aliases.
 */

import * as fs from "fs";
import * as path from "path";
import BetterSqlite3 from "better-sqlite3";
import { encryptBuffer, decryptBuffer } from "../db/encrypt.js";

const encPath  = path.resolve(import.meta.dirname, "../../../frontend/public/data/data.db.enc");
const candPath = path.resolve(import.meta.dirname, "../../split-candidates.json");

const keyHex = process.env.DATA_KEY;
if (!keyHex) { console.error("DATA_KEY not set"); process.exit(1); }

if (!fs.existsSync(candPath)) {
  console.error("split-candidates.json not found — run npm run db:find-splits first");
  process.exit(1);
}

interface CandidateEntry {
  keep:    { id: number; name: string; team: string };
  absorb:  { id: number; name: string; team: string };
  approved: boolean | null;
}

const candidates: CandidateEntry[] = JSON.parse(fs.readFileSync(candPath, "utf-8"));
const approved = candidates.filter((c) => c.approved === true);

if (approved.length === 0) {
  console.log("No approved candidates — nothing to do.");
  process.exit(0);
}

const enc = fs.readFileSync(encPath);
const plain = decryptBuffer(enc, keyHex);
const sqlite = new BetterSqlite3(plain);

// ── Alias rules (team → team merges) ─────────────────────────────────────────

const existingAliases = sqlite.prepare(
  "SELECT name, canonical_team, aliases_json FROM athlete_alias_rules"
).all() as { name: string; canonical_team: string; aliases_json: string }[];

const alreadyAliased = new Set<string>();
for (const rule of existingAliases) {
  const aliases = JSON.parse(rule.aliases_json) as Array<{ name: string; team: string }>;
  for (const alias of aliases) {
    alreadyAliased.add(`${rule.name}|${rule.canonical_team}|||${alias.name}|${alias.team}`);
  }
}

const insertAlias = sqlite.prepare(
  "INSERT INTO athlete_alias_rules (name, canonical_team, aliases_json, note) VALUES (?, ?, ?, ?)"
);

// ── Result assignments (solo merges) ─────────────────────────────────────────

const existingAssignments = sqlite.prepare(
  "SELECT event_id, bib FROM result_assignments"
).all() as { event_id: number; bib: string }[];

const alreadyAssigned = new Set(existingAssignments.map((r) => `${r.event_id}|${r.bib}`));

const insertAssignment = sqlite.prepare(
  "INSERT INTO result_assignments (event_id, bib, athlete_id, note) VALUES (?, ?, ?, ?)"
);

const getAbsorbResults = sqlite.prepare(
  "SELECT r.event_id, r.bib, r.distance_name, r.name FROM results r WHERE r.athlete_id = ?"
);

// Build set of (athlete_id, event_id, distance_name) the keep already owns
const keepSlots = sqlite.prepare(
  "SELECT event_id, distance FROM athlete_results WHERE athlete_id = ?"
);

// ── Apply ─────────────────────────────────────────────────────────────────────

let aliasAdded = 0;
let aliasSkipped = 0;
let assignAdded = 0;
let assignSkipped = 0;

for (const c of approved) {
  const useAlias = c.absorb.team !== "" && c.keep.team !== "";

  if (useAlias) {
    const dedupeKey = `${c.keep.name}|${c.keep.team}|||${c.absorb.name}|${c.absorb.team}`;
    if (alreadyAliased.has(dedupeKey)) {
      console.log(`  · already aliased: "${c.absorb.name}" @ "${c.absorb.team}" → "${c.keep.name}"`);
      aliasSkipped++;
      continue;
    }
    insertAlias.run(
      c.keep.name,
      c.keep.team,
      JSON.stringify([{ name: c.absorb.name, team: c.absorb.team }]),
      "split-reviews",
    );
    console.log(`  + alias: "${c.absorb.name}" @ "${c.absorb.team}" → "${c.keep.name}" @ "${c.keep.team}"`);
    alreadyAliased.add(dedupeKey);
    aliasAdded++;
  } else {
    const rows = getAbsorbResults.all(c.absorb.id) as { event_id: number; bib: string; distance_name: string; name: string }[];
    const keepOwned = new Set(
      (keepSlots.all(c.keep.id) as { event_id: number; distance: string }[])
        .map((r) => `${r.event_id}|${r.distance}`)
    );
    const normName = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
    const absorbNorm = normName(c.absorb.name);
    let added = 0;
    let distSkipped = 0;
    let nameSkipped = 0;
    for (const row of rows) {
      const key = `${row.event_id}|${row.bib}`;
      if (alreadyAssigned.has(key)) continue;
      if (keepOwned.has(`${row.event_id}|${row.distance_name}`)) { distSkipped++; continue; }
      // Skip results where the actual name on the bib doesn't match the absorb athlete —
      // indicates a previous pipeline misattribution rather than a genuine split.
      if (normName(row.name) !== absorbNorm) { nameSkipped++; continue; }
      insertAssignment.run(row.event_id, row.bib, c.keep.id, "split-reviews");
      alreadyAssigned.add(key);
      keepOwned.add(`${row.event_id}|${row.distance_name}`);
      added++;
    }
    if (added > 0) {
      const notes = [
        distSkipped > 0 ? `${distSkipped} skipped — keep already has that event/distance` : "",
        nameSkipped > 0 ? `${nameSkipped} skipped — name mismatch (pipeline misattribution)` : "",
      ].filter(Boolean).join(", ");
      console.log(`  + assignments (${added}): "${c.absorb.name}" → athlete ${c.keep.id} "${c.keep.name}"${notes ? ` (${notes})` : ""}`);
      assignAdded += added;
    } else {
      console.log(`  · already assigned: "${c.absorb.name}" (${c.absorb.id})`);
      assignSkipped++;
    }
  }
}

const encrypted = encryptBuffer(sqlite.serialize() as Buffer, keyHex);
sqlite.close();
fs.writeFileSync(encPath, encrypted);

const summary: string[] = [];
if (aliasAdded)    summary.push(`${aliasAdded} alias rule(s)`);
if (assignAdded)   summary.push(`${assignAdded} result assignment(s)`);
if (aliasSkipped + assignSkipped > 0)
  summary.push(`${aliasSkipped + assignSkipped} skipped — already present`);
console.log(`✓ Added ${summary.join(", ")} to data.db.enc`);
console.log("  Run npm run scrape to rebuild with new aliases/assignments");
