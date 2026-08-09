import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { decryptBuffer } from "../db/encrypt.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const encPath = path.resolve(__dirname, "../../../frontend/public/data/data.db.enc");
const enc = fs.readFileSync(encPath);
const db = new Database(decryptBuffer(enc, process.env.DATA_KEY!));

// Find same-name athletes who both appear in the aggregate ranking
// with overlapping year+category slices — strong split indicator.
const rows = db.prepare(`
  SELECT
    a1.athlete_id    as id1,
    a2.athlete_id    as id2,
    ath1.name        as name,
    a1.year, a1.distance, a1.gender,
    a1.total_points  as pts1,
    a2.total_points  as pts2,
    ath1.canonical_team as team1,
    ath2.canonical_team as team2
  FROM aggregate_athletes a1
  JOIN aggregate_athletes a2
    ON  a1.year     = a2.year
    AND a1.distance = a2.distance
    AND a1.gender   = a2.gender
    AND a1.athlete_id < a2.athlete_id
  JOIN athletes ath1 ON ath1.id = a1.athlete_id
  JOIN athletes ath2 ON ath2.id = a2.athlete_id
  WHERE ath1.name_lower = ath2.name_lower
  ORDER BY a1.year DESC, a1.distance, name
`).all() as any[];

if (rows.length === 0) {
  console.log("No same-name duplicates found in ranking slices.");
} else {
  let lastPair = "";
  for (const r of rows) {
    const pair = `${r.id1}|${r.id2}`;
    if (pair !== lastPair) {
      console.log(`\n${r.name}`);
      console.log(`  id=${r.id1}  team: ${r.team1 ?? "—"}`);
      console.log(`  id=${r.id2}  team: ${r.team2 ?? "—"}`);
      lastPair = pair;
    }
    console.log(`  ${r.year} ${r.distance} ${r.gender}  →  ${r.pts1} pts / ${r.pts2} pts`);
  }
  console.log(`\n${new Set(rows.map((r:any) => `${r.id1}|${r.id2}`)).size} pair(s) with overlapping ranking slices`);
}
