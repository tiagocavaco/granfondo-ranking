/**
 * apply-team-aliases.ts
 *
 * Reads team-alias-candidates.json and adds all approved: true entries
 * as team aliases in data.db.enc, then re-runs the scrape.
 *
 * Usage:
 *   npm run db:apply-team-aliases
 */

import * as fs from "fs";
import * as path from "path";
import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@granfondo/database/schema"; // needed for migrate()
import { encryptBuffer, decryptBuffer } from "../db/encrypt.js";
import { loadAliasMap, validateAndFlattenAlias } from "../db/alias-utils.js";

const encPath  = path.resolve(import.meta.dirname, "../../../frontend/public/data/data.db.enc");
const tmpPath  = path.resolve(import.meta.dirname, "../../.tmp-apply.db");
const candPath = path.resolve(import.meta.dirname, "../../team-alias-candidates.json");
const migrationsPath = path.resolve(import.meta.dirname, "../../../database/migrations");

const keyHex = process.env.DATA_KEY;
if (!keyHex) { console.error("DATA_KEY not set"); process.exit(1); }

if (!fs.existsSync(candPath)) {
  console.error("team-alias-candidates.json not found — run npm run db:find-team-aliases first");
  process.exit(1);
}

const candidates: Array<{ from: string; to: string; approved: boolean | null }> =
  JSON.parse(fs.readFileSync(candPath, "utf-8"));

const approved = candidates.filter((c) => c.approved === true);
if (approved.length === 0) {
  console.log("No approved candidates — nothing to do.");
  process.exit(0);
}

const enc = fs.readFileSync(encPath);
const plain = decryptBuffer(enc, keyHex);
fs.writeFileSync(tmpPath, plain);

const sqlite = new BetterSqlite3(tmpPath);
migrate(drizzle(sqlite, { schema }), { migrationsFolder: migrationsPath });

const aliasMap = loadAliasMap(sqlite);
let added = 0;
let skipped = 0;
for (const c of approved) {
  let aliasKey: string, canonicalKey: string;
  try {
    ({ aliasKey, canonicalKey } = validateAndFlattenAlias(c.from, c.to, aliasMap));
  } catch (e) {
    console.warn(`  ⚠ Skipped "${c.from}" → "${c.to}": ${(e as Error).message}`);
    skipped++;
    continue;
  }
  sqlite.prepare("INSERT OR IGNORE INTO teams (id, canonical_key, alias_keys) VALUES (NULL, ?, '[]')").run(canonicalKey);
  const row = sqlite.prepare("SELECT alias_keys FROM teams WHERE canonical_key = ?").get(canonicalKey) as { alias_keys: string };
  const existing = JSON.parse(row.alias_keys) as string[];
  if (!existing.includes(aliasKey)) {
    existing.push(aliasKey);
    sqlite.prepare("UPDATE teams SET alias_keys = ? WHERE canonical_key = ?").run(JSON.stringify(existing), canonicalKey);
  }
  aliasMap.set(aliasKey, canonicalKey);
  console.log(`  + "${aliasKey}" → "${canonicalKey}"`);
  added++;
}

sqlite.close();
const encrypted = encryptBuffer(fs.readFileSync(tmpPath), keyHex);
fs.writeFileSync(encPath, encrypted);
try { fs.unlinkSync(tmpPath); } catch {}

console.log(`✓ Added ${added} team alias(es) to data.db.enc${skipped ? ` (${skipped} skipped — cycle or chain detected)` : ""}`);
console.log(`  Run npm run scrape to rebuild with new aliases`);
