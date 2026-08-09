/**
 * manage-db.ts
 *
 * CLI for adding, removing, and listing manual override rows in data.db.enc.
 * Decrypts in-place, modifies, re-encrypts — no plaintext left on disk.
 *
 * Usage:
 *   npm run db:manage -- <command> [options]
 *
 * Commands:
 *   list                              List all manual overrides
 *   add alias    --name X --team Y --alias-name A --alias-team B [--note N]
 *   add assignment --event-id E --bib B --athlete-id A [--note N]
 *   add team-alias --from F --to T
 *   remove alias       --name X
 *   remove assignment  --event-id E --bib B
 *   remove team-alias  --from F
 */

import * as fs from "fs";
import * as path from "path";
import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@granfondo/database/schema";
import { encryptBuffer, decryptBuffer } from "./encrypt.js";
import { normalizeTeam } from "../normalize.js";
import {
  loadAliasMap,
  validateAndFlattenAlias,
  rewriteLookupKeysForAlias,
} from "./alias-utils.js";

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const envFile = path.join(import.meta.dirname, "..", ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m) {
      process.env[m[1]] ??= m[2].trim();
    }
  }
}

const keyHex = process.env.DATA_KEY;
if (!keyHex) {
  console.error("DATA_KEY not set");
  process.exit(1);
}

const encPath = path.resolve(
  import.meta.dirname,
  "../../../frontend/public/data/data.db.enc",
);
const migrationsPath = path.resolve(
  import.meta.dirname,
  "../../../database/migrations",
);

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a
        .slice(2)
        .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      out[key] = argv[i + 1] ?? "true";
      i++;
    }
  }

  return out;
}

function openDb(): {
  sqlite: BetterSqlite3.Database;
  db: ReturnType<typeof drizzle>;
} {
  const enc = fs.readFileSync(encPath);
  const plain = decryptBuffer(enc, keyHex!);
  const sqlite = new BetterSqlite3(plain);
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsPath });
  return { sqlite, db };
}

function saveDb(sqlite: BetterSqlite3.Database): void {
  const plain = sqlite.serialize() as Buffer;
  const encrypted = encryptBuffer(plain, keyHex!);
  fs.writeFileSync(encPath, encrypted);
}

// ── Commands ──────────────────────────────────────────────────────────────────

function cmdList(): void {
  const { sqlite, db } = openDb();

  const aliases = db.select().from(schema.athleteAliasRules).all();
  const assignments = db.select().from(schema.resultAssignments).all();
  const teamRows = sqlite
    .prepare(
      "SELECT canonical_key, alias_keys FROM teams ORDER BY canonical_key",
    )
    .all() as { canonical_key: string; alias_keys: string }[];
  const totalAliases = teamRows.reduce(
    (n, r) => n + (JSON.parse(r.alias_keys) as string[]).length,
    0,
  );

  console.log(
    `\n── Athlete alias rules (${aliases.length}) ──────────────────────`,
  );
  for (const r of aliases) {
    const aliases2 = JSON.parse(r.aliasesJson) as Array<{
      name: string;
      team: string;
    }>;
    console.log(`  [${r.id}] "${r.name}" @ "${r.canonicalTeam}"`);
    for (const a of aliases2) {
      console.log(`       alias: "${a.name}" @ "${a.team}"`);
    }

    if (r.note) {
      console.log(`       note: ${r.note}`);
    }
  }

  console.log(
    `\n── Result assignments (${assignments.length}) ──────────────────────`,
  );
  for (const r of assignments) {
    console.log(
      `  [${r.id}] event ${r.eventId} bib ${r.bib} → athlete ${r.athleteId}`,
    );
    if (r.note) {
      console.log(`       note: ${r.note}`);
    }
  }

  const blocks = db.select().from(schema.blockedResults).all();
  console.log(`\n── Blocked results (${blocks.length}) ──────────────────────`);
  for (const r of blocks) {
    console.log(
      `  [${r.id}] event ${r.eventId} bib ${r.bib} blocked from athlete ${r.blockedAthleteId}`,
    );
    if (r.note) {
      console.log(`       note: ${r.note}`);
    }
  }

  console.log(`\n── Team aliases (${totalAliases}) ──────────────────────`);
  for (const r of teamRows) {
    const aliases2 = JSON.parse(r.alias_keys) as string[];
    for (const a of aliases2) {
      console.log(`  "${a}" → "${r.canonical_key}"`);
    }
  }

  sqlite.close();
}

function cmdAdd(args: Record<string, string>): void {
  const target = args["_target"];
  const { sqlite, db } = openDb();

  if (target === "alias") {
    const { name, team, aliasName, aliasTeam, note } = args;
    if (!name || !team || !aliasName || !aliasTeam) {
      console.error(
        "Usage: add alias --name X --team Y --alias-name A --alias-team B [--note N]",
      );
      process.exit(1);
    }

    db.insert(schema.athleteAliasRules)
      .values({
        name,
        canonicalTeam: team,
        aliasesJson: JSON.stringify([{ name: aliasName, team: aliasTeam }]),
        note: note ?? null,
      })
      .run();
    console.log(`✓ Added alias rule for "${name}"`);
  } else if (target === "assignment") {
    const { eventId, bib, athleteId, note } = args;
    if (!eventId || !bib || !athleteId) {
      console.error(
        "Usage: add assignment --event-id E --bib B --athlete-id A [--note N]",
      );
      process.exit(1);
    }

    db.insert(schema.resultAssignments)
      .values({
        eventId: Number(eventId),
        bib,
        athleteId: Number(athleteId),
        note: note ?? null,
      })
      .run();
    console.log(
      `✓ Added assignment: event ${eventId} bib ${bib} → athlete ${athleteId}`,
    );
  } else if (target === "team-alias") {
    const { from: fromKey, to: toKey } = args;
    if (!fromKey || !toKey) {
      console.error("Usage: add team-alias --from F --to T");
      process.exit(1);
    }

    const aliasMap = loadAliasMap(sqlite);
    let aliasKey: string, canonicalKey: string;
    try {
      ({ aliasKey, canonicalKey } = validateAndFlattenAlias(
        normalizeTeam(fromKey),
        normalizeTeam(toKey),
        aliasMap,
      ));
    } catch (e) {
      console.error(`✗ ${(e as Error).message}`);
      process.exit(1);
    }

    // Ensure canonical row exists (may be absent before first scrape)
    sqlite
      .prepare(
        "INSERT OR IGNORE INTO teams (id, canonical_key, alias_keys) VALUES (NULL, ?, '[]')",
      )
      .run(canonicalKey);

    const canonTeamRow = sqlite
      .prepare("SELECT id FROM teams WHERE canonical_key = ?")
      .get(canonicalKey) as { id: number } | undefined;

    const getCanonAliases = () =>
      JSON.parse(
        (sqlite
          .prepare("SELECT alias_keys FROM teams WHERE canonical_key = ?")
          .get(canonicalKey) as { alias_keys: string }).alias_keys,
      ) as string[];

    // If aliasKey was itself a canonical with sub-aliases, migrate them directly to
    // canonicalKey so the DB stays flat (no two-hop chains).
    const aliasAsCanonical = sqlite
      .prepare("SELECT alias_keys FROM teams WHERE canonical_key = ?")
      .get(aliasKey) as { alias_keys: string } | undefined;
    const subAliasesToMigrate: string[] =
      aliasAsCanonical ? (JSON.parse(aliasAsCanonical.alias_keys) as string[]) : [];

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
        const changed = rewriteLookupKeysForAlias(sqlite, subTeamRow.id, canonTeamRow.id);
        if (changed > 0) {
          console.log(
            `  · rewrote ${changed} athlete_lookup key(s) for sub-alias "${subAlias}": team ID ${subTeamRow.id} → ${canonTeamRow.id}`,
          );
        }
      }
    }
    if (subAliasesToMigrate.length > 0) {
      sqlite
        .prepare("UPDATE teams SET alias_keys = '[]' WHERE canonical_key = ?")
        .run(aliasKey);
    }

    // Append aliasKey to the canonical's alias_keys array (if not already present)
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
          `  · rewrote ${changed} athlete_lookup key(s): team ID ${aliasTeamRow.id} → ${canonTeamRow.id}`,
        );
      }
    }

    console.log(`✓ Added team alias: "${aliasKey}" → "${canonicalKey}"`);
  } else if (target === "block") {
    const { eventId, bib, athleteId, note } = args;
    if (!eventId || !bib || !athleteId) {
      console.error(
        "Usage: add block --event-id E --bib B --athlete-id A [--note N]",
      );
      process.exit(1);
    }

    db.insert(schema.blockedResults)
      .values({
        eventId: Number(eventId),
        bib,
        blockedAthleteId: Number(athleteId),
        note: note ?? null,
      })
      .run();
    console.log(
      `✓ Blocked event ${eventId} bib ${bib} from athlete ${athleteId}`,
    );
  } else {
    console.error(
      "Unknown add target. Use: alias | assignment | block | team-alias",
    );
    process.exit(1);
  }

  saveDb(sqlite);
  sqlite.close();
}

function cmdRemove(args: Record<string, string>): void {
  const target = args["_target"];
  const { sqlite, db } = openDb();

  if (target === "alias") {
    const { name } = args;
    if (!name) {
      console.error("Usage: remove alias --name X");
      process.exit(1);
    }

    const result = db
      .delete(schema.athleteAliasRules)
      .where(eq(schema.athleteAliasRules.name, name))
      .run() as unknown as { changes: number };
    console.log(
      result.changes
        ? `✓ Removed alias rule for "${name}"`
        : `⚠ No alias rule found for "${name}"`,
    );
  } else if (target === "assignment") {
    const { eventId, bib } = args;
    if (!eventId || !bib) {
      console.error("Usage: remove assignment --event-id E --bib B");
      process.exit(1);
    }

    const result = db
      .delete(schema.resultAssignments)
      .where(
        and(
          eq(schema.resultAssignments.eventId, Number(eventId)),
          eq(schema.resultAssignments.bib, bib),
        ),
      )
      .run() as unknown as { changes: number };
    console.log(
      result.changes
        ? `✓ Removed assignment: event ${eventId} bib ${bib}`
        : `⚠ No assignment found`,
    );
  } else if (target === "team-alias") {
    const { from } = args;
    if (!from) {
      console.error("Usage: remove team-alias --from F");
      process.exit(1);
    }

    const key = normalizeTeam(from);
    // Remove aliasKey from whichever canonical's alias_keys array contains it
    const teamRows2 = sqlite
      .prepare("SELECT canonical_key, alias_keys FROM teams")
      .all() as {
      canonical_key: string;
      alias_keys: string;
    }[];
    let removed = false;
    for (const r of teamRows2) {
      const arr = JSON.parse(r.alias_keys) as string[];
      const idx =
        arr.indexOf(key) !== -1 ? arr.indexOf(key) : arr.indexOf(from);
      if (idx !== -1) {
        arr.splice(idx, 1);
        sqlite
          .prepare("UPDATE teams SET alias_keys = ? WHERE canonical_key = ?")
          .run(JSON.stringify(arr), r.canonical_key);
        removed = true;
        break;
      }
    }

    console.log(
      removed
        ? `✓ Removed team alias for "${from}"`
        : `⚠ No team alias found for "${from}"`,
    );
  } else if (target === "block") {
    const { eventId, bib } = args;
    if (!eventId || !bib) {
      console.error("Usage: remove block --event-id E --bib B");
      process.exit(1);
    }

    const result = db
      .delete(schema.blockedResults)
      .where(
        and(
          eq(schema.blockedResults.eventId, Number(eventId)),
          eq(schema.blockedResults.bib, bib),
        ),
      )
      .run() as unknown as { changes: number };
    console.log(
      result.changes
        ? `✓ Removed block: event ${eventId} bib ${bib}`
        : `⚠ No block found`,
    );
  } else {
    console.error(
      "Unknown remove target. Use: alias | assignment | block | team-alias",
    );
    process.exit(1);
  }

  saveDb(sqlite);
  sqlite.close();
}

// ── Main ──────────────────────────────────────────────────────────────────────

const [cmd, subTarget, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
args["_target"] = subTarget ?? "";

if (cmd === "list") {
  cmdList();
} else if (cmd === "add") {
  cmdAdd(args);
} else if (cmd === "remove") {
  cmdRemove(args);
} else {
  console.error("Usage: npm run db:manage -- <list|add|remove> ...");
  process.exit(1);
}
