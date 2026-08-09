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
import {
  loadAliasMap,
  validateAndFlattenAlias,
  rewriteLookupKeysForAlias,
} from "../db/alias-utils.js";

const encPath = path.resolve(
  import.meta.dirname,
  "../../../frontend/public/data/data.db.enc",
);
const tmpPath = path.resolve(import.meta.dirname, "../../.tmp-apply.db");
const candPath = path.resolve(
  import.meta.dirname,
  "../../team-alias-candidates.json",
);
const migrationsPath = path.resolve(
  import.meta.dirname,
  "../../../database/migrations",
);

const keyHex = process.env.DATA_KEY;
if (!keyHex) {
  console.error("DATA_KEY not set");
  process.exit(1);
}

if (!fs.existsSync(candPath)) {
  console.error(
    "team-alias-candidates.json not found — run npm run db:find-team-aliases first",
  );
  process.exit(1);
}

const candidates: Array<{
  from: string;
  to: string;
  approved: boolean | null;
}> = JSON.parse(fs.readFileSync(candPath, "utf-8"));

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
    ({ aliasKey, canonicalKey } = validateAndFlattenAlias(
      c.from,
      c.to,
      aliasMap,
    ));
  } catch (e) {
    console.warn(
      `  ⚠ Skipped "${c.from}" → "${c.to}": ${(e as Error).message}`,
    );
    skipped++;
    continue;
  }

  sqlite
    .prepare(
      "INSERT OR IGNORE INTO teams (id, canonical_key, alias_keys) VALUES (NULL, ?, '[]')",
    )
    .run(canonicalKey);

  const canonTeamRow = sqlite
    .prepare("SELECT id FROM teams WHERE canonical_key = ?")
    .get(canonicalKey) as { id: number } | undefined;

  // If aliasKey was itself a canonical with sub-aliases, migrate them directly to
  // canonicalKey so the DB stays flat (no two-hop chains). This handles the case
  // where both ends of an approved pair are existing canonical teams.
  const aliasAsCanonical = sqlite
    .prepare("SELECT alias_keys FROM teams WHERE canonical_key = ?")
    .get(aliasKey) as { alias_keys: string } | undefined;

  const subAliasesToMigrate: string[] = aliasAsCanonical
    ? (JSON.parse(aliasAsCanonical.alias_keys) as string[])
    : [];

  const getCanonAliases = () =>
    JSON.parse(
      (
        sqlite
          .prepare("SELECT alias_keys FROM teams WHERE canonical_key = ?")
          .get(canonicalKey) as { alias_keys: string }
      ).alias_keys,
    ) as string[];

  // Migrate each sub-alias of aliasKey directly to canonicalKey
  for (const subAlias of subAliasesToMigrate) {
    const canonAliases = getCanonAliases();
    if (!canonAliases.includes(subAlias)) {
      canonAliases.push(subAlias);
      sqlite
        .prepare("UPDATE teams SET alias_keys = ? WHERE canonical_key = ?")
        .run(JSON.stringify(canonAliases), canonicalKey);
    }
    const subTeamRow = sqlite
      .prepare("SELECT id FROM teams WHERE canonical_key = ?")
      .get(subAlias) as { id: number } | undefined;
    if (subTeamRow && canonTeamRow) {
      const changed = rewriteLookupKeysForAlias(
        sqlite,
        subTeamRow.id,
        canonTeamRow.id,
      );
      if (changed > 0) {
        console.log(
          `    · rewrote ${changed} athlete_lookup key(s) for sub-alias "${subAlias}": team ${subTeamRow.id} → ${canonTeamRow.id}`,
        );
      }
    }
    aliasMap.set(subAlias, canonicalKey);
  }

  // Clear aliasKey's own sub-alias list (it is now an alias itself, not a canonical)
  if (subAliasesToMigrate.length > 0) {
    sqlite
      .prepare("UPDATE teams SET alias_keys = '[]' WHERE canonical_key = ?")
      .run(aliasKey);
  }

  // Add aliasKey itself to canonicalKey's alias list
  const canonAliasesFinal = getCanonAliases();
  if (!canonAliasesFinal.includes(aliasKey)) {
    canonAliasesFinal.push(aliasKey);
    sqlite
      .prepare("UPDATE teams SET alias_keys = ? WHERE canonical_key = ?")
      .run(JSON.stringify(canonAliasesFinal), canonicalKey);
  }

  // Rewrite athlete_lookup keys so the next scrape seed preserves athlete IDs
  const aliasTeamRow = sqlite
    .prepare("SELECT id FROM teams WHERE canonical_key = ?")
    .get(aliasKey) as { id: number } | undefined;
  if (aliasTeamRow && canonTeamRow) {
    const changed = rewriteLookupKeysForAlias(
      sqlite,
      aliasTeamRow.id,
      canonTeamRow.id,
    );
    if (changed > 0) {
      console.log(
        `    · rewrote ${changed} athlete_lookup key(s): team ${aliasTeamRow.id} → ${canonTeamRow.id}`,
      );
    }
  }

  aliasMap.set(aliasKey, canonicalKey);
  console.log(`  + "${aliasKey}" → "${canonicalKey}"`);
  added++;
}

sqlite.close();
const encrypted = encryptBuffer(fs.readFileSync(tmpPath), keyHex);
fs.writeFileSync(encPath, encrypted);
try {
  fs.unlinkSync(tmpPath);
} catch {}

console.log(
  `✓ Added ${added} team alias(es) to data.db.enc${skipped ? ` (${skipped} skipped — cycle or chain detected)` : ""}`,
);
console.log(`  Run npm run scrape to rebuild with new aliases`);
