/**
 * One-off script: collapse runs of multiple spaces in results.name and results.team
 * to a single space, and trim leading/trailing whitespace.
 *
 * These come from the raw StopAndGo API data. transform.ts now trims on ingest,
 * but cached events still carry the old multi-space strings.  Running this script
 * patches the cached rows directly so a fast scrape picks up the corrected names.
 *
 * Usage:
 *   npm run db:fix-whitespace
 */

import { createDecipheriv, createCipheriv, randomFillSync } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import Database from "better-sqlite3";
import { DB_ENC_PATH } from "../paths.js";

const keyHex = process.env.DATA_KEY;
if (!keyHex) {
  console.error("DATA_KEY not set");
  process.exit(1);
}

const enc = readFileSync(DB_ENC_PATH);
const key = Buffer.from(keyHex, "hex");
const iv = enc.subarray(0, 12);
const tag = enc.subarray(12, 28);
const cipher = enc.subarray(28);

const decipher = createDecipheriv("aes-256-gcm", key, iv);
decipher.setAuthTag(tag);
const plain = Buffer.concat([decipher.update(cipher), decipher.final()]);

const db = new Database(plain);

function collapseSpaces(val: string): string {
  return val.trim().replace(/\s+/g, " ");
}

db.transaction(() => {
  const names = db
    .prepare("SELECT DISTINCT name FROM results WHERE name LIKE '%  %'")
    .all() as { name: string }[];

  let fixedNames = 0;
  for (const row of names) {
    const fixed = collapseSpaces(row.name);
    if (fixed !== row.name) {
      db.prepare("UPDATE results SET name = ? WHERE name = ?").run(
        fixed,
        row.name,
      );
      fixedNames++;
    }
  }

  const teams = db
    .prepare("SELECT DISTINCT team FROM results WHERE team LIKE '%  %'")
    .all() as { team: string }[];

  let fixedTeams = 0;
  for (const row of teams) {
    const fixed = collapseSpaces(row.team);
    if (fixed !== row.team) {
      db.prepare("UPDATE results SET team = ? WHERE team = ?").run(
        fixed,
        row.team,
      );
      fixedTeams++;
    }
  }

  console.log(`✓ Fixed ${fixedNames} name variants, ${fixedTeams} team variants`);
})();

const plainFixed = db.serialize();
db.close();

const newIv = Buffer.allocUnsafe(12);
randomFillSync(newIv);

const encCipher = createCipheriv("aes-256-gcm", key, newIv);
const encData = Buffer.concat([encCipher.update(plainFixed), encCipher.final()]);
const authTag = encCipher.getAuthTag();

writeFileSync(DB_ENC_PATH, Buffer.concat([newIv, authTag, encData]));
console.log(`✓ Written back to ${DB_ENC_PATH}`);
