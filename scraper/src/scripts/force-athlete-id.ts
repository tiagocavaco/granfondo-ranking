/**
 * force-athlete-id.ts
 *
 * Forces a specific athlete lookup key to use a given numeric ID.
 * If the target ID is already claimed by another lookup entry, the two
 * entries swap IDs so no ID is lost.
 *
 * Usage:
 *   npm run db:force-id -- "jorge mariz|1" 1
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import BetterSqlite3 from "better-sqlite3";
import { encryptBuffer, decryptBuffer } from "../db/encrypt.js";

const encPath = resolve(
  import.meta.dirname,
  "../../../frontend/public/data/data.db.enc",
);

const keyHex = process.env.DATA_KEY;
if (!keyHex) {
  console.error("DATA_KEY not set");
  process.exit(1);
}

const [lookupKey, rawId] = process.argv.slice(2);
if (!lookupKey || !rawId) {
  console.error("Usage: db:force-id -- <lookup-key> <athlete-id>");
  console.error('  e.g. db:force-id -- "jorge mariz|1" 1');
  process.exit(1);
}
const targetId = Number(rawId);

const enc = readFileSync(encPath);
const plain = decryptBuffer(enc, keyHex);
const sqlite = new BetterSqlite3(plain);

type LookupRow = { key: string; athlete_id: number };

const source = sqlite
  .prepare("SELECT key, athlete_id FROM athlete_lookup WHERE key = ?")
  .get(lookupKey) as LookupRow | undefined;

if (!source) {
  console.error(`No lookup entry found for key: "${lookupKey}"`);
  process.exit(1);
}

if (source.athlete_id === targetId) {
  console.log(`Already set: ${source.key} → ${source.athlete_id}`);
  process.exit(0);
}

const displaced = sqlite
  .prepare("SELECT key, athlete_id FROM athlete_lookup WHERE athlete_id = ?")
  .get(targetId) as LookupRow | undefined;

if (displaced) {
  // Swap: give the displaced entry the source's current ID
  console.log(`Swap: "${displaced.key}" ${targetId} → ${source.athlete_id}`);
  sqlite
    .prepare("UPDATE athlete_lookup SET athlete_id = ? WHERE key = ?")
    .run(source.athlete_id, displaced.key);
}

sqlite
  .prepare("UPDATE athlete_lookup SET athlete_id = ? WHERE key = ?")
  .run(targetId, lookupKey);

console.log(`Set:  "${source.key}" ${source.athlete_id} → ${targetId}`);

const updated = sqlite.serialize();
const reenc = encryptBuffer(Buffer.from(updated), keyHex);
writeFileSync(encPath, reenc);
console.log("✓ data.db.enc updated — run scrape to apply");
