import BetterSqlite3 from "better-sqlite3";
import { decryptBuffer } from "../db/encrypt.js";
import { DB_ENC_PATH } from "../paths.js";
import fs from "fs";

const plain = decryptBuffer(fs.readFileSync(DB_ENC_PATH), process.env.DATA_KEY!);
fs.writeFileSync("/tmp/granfondo_check.db", plain);
const db = new BetterSqlite3("/tmp/granfondo_check.db");

const participants = db.prepare("SELECT event_id, athlete_id FROM participants").all() as any[];
const events = new Map(
  (db.prepare("SELECT id, name FROM events").all() as any[]).map((e: any) => [e.id, e.name])
);

let linked = 0;
const statsPerEvent = new Map<number, { total: number; linked: number }>();

for (const p of participants) {
  const s = statsPerEvent.get(p.event_id) ?? { total: 0, linked: 0 };
  s.total++;
  if (p.athlete_id && p.athlete_id !== 0) { s.linked++; linked++; }
  statsPerEvent.set(p.event_id, s);
}

console.log(`Total participants : ${participants.length}`);
console.log(`Linked to athlete  : ${linked} (${Math.round(linked / participants.length * 100)}%)`);
console.log(`Unlinked           : ${participants.length - linked}\n`);
console.log("Per event:");
for (const [eid, s] of [...statsPerEvent.entries()].sort((a, b) => a[0] - b[0])) {
  const pct = Math.round(s.linked / s.total * 100);
  console.log(`  ${(events.get(eid) ?? eid).toString().slice(0, 44).padEnd(46)} ${s.linked}/${s.total} (${pct}%)`);
}

db.close();
try { fs.unlinkSync("/tmp/granfondo_check.db"); } catch {}
