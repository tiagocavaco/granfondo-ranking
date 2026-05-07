import { describe, it, expect } from "vitest";
import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as path from "path";
import * as schema from "@granfondo/database/schema";
import { rewriteLookupKeysForAlias } from "./alias-utils.js";

const migrationsPath = path.resolve(import.meta.dirname, "../../../database/migrations");

function makeDb(): BetterSqlite3.Database {
  const sqlite = new BetterSqlite3(":memory:");
  migrate(drizzle(sqlite, { schema }), { migrationsFolder: migrationsPath });
  return sqlite;
}

function ins(sqlite: BetterSqlite3.Database, key: string, athleteId: number): void {
  sqlite.prepare("INSERT INTO athlete_lookup (key, athlete_id) VALUES (?, ?)").run(key, athleteId);
}

function keys(sqlite: BetterSqlite3.Database): string[] {
  return (sqlite.prepare("SELECT key FROM athlete_lookup ORDER BY key").all() as { key: string }[]).map((r) => r.key);
}

function insTeam(sqlite: BetterSqlite3.Database, canonicalKey: string): number {
  sqlite.prepare("INSERT INTO teams (id, canonical_key, alias_keys) VALUES (NULL, ?, '[]')").run(canonicalKey);
  return (sqlite.prepare("SELECT id FROM teams WHERE canonical_key = ?").get(canonicalKey) as { id: number }).id;
}

// ── rewriteLookupKeysForAlias ─────────────────────────────────────────────────

describe("rewriteLookupKeysForAlias", () => {
  it("rewrites keys whose suffix matches fromTeamId", () => {
    const sqlite = makeDb();
    ins(sqlite, "joao silva|5", 1);
    ins(sqlite, "maria costa|5", 2);
    rewriteLookupKeysForAlias(sqlite, 5, 10);
    expect(keys(sqlite)).toEqual(["joao silva|10", "maria costa|10"]);
    sqlite.close();
  });

  it("does not touch keys with a different team ID", () => {
    const sqlite = makeDb();
    ins(sqlite, "joao silva|5", 1);
    ins(sqlite, "rui gomes|10", 2);
    rewriteLookupKeysForAlias(sqlite, 5, 10);
    expect(keys(sqlite)).toEqual(["joao silva|10", "rui gomes|10"]);
    sqlite.close();
  });

  it("does not rewrite solo-collision keys", () => {
    const sqlite = makeDb();
    ins(sqlite, "david vaz|solo:Masters A Male:2025", 3);
    ins(sqlite, "david vaz|5", 4);
    rewriteLookupKeysForAlias(sqlite, 5, 10);
    expect(keys(sqlite).sort()).toEqual(["david vaz|10", "david vaz|solo:Masters A Male:2025"]);
    sqlite.close();
  });

  it("does not rewrite individual (empty suffix) keys", () => {
    const sqlite = makeDb();
    ins(sqlite, "carlos mota|", 5);
    rewriteLookupKeysForAlias(sqlite, 0, 10);
    expect(keys(sqlite)).toEqual(["carlos mota|"]);
    sqlite.close();
  });

  it("does not partially match a longer team ID (5 vs 15, 50)", () => {
    const sqlite = makeDb();
    ins(sqlite, "a|5",  1);
    ins(sqlite, "b|15", 2);
    ins(sqlite, "c|50", 3);
    rewriteLookupKeysForAlias(sqlite, 5, 99);
    expect(keys(sqlite).sort()).toEqual(["a|99", "b|15", "c|50"]);
    sqlite.close();
  });

  it("returns the number of rows changed", () => {
    const sqlite = makeDb();
    ins(sqlite, "a|7", 1);
    ins(sqlite, "b|7", 2);
    ins(sqlite, "c|9", 3);
    expect(rewriteLookupKeysForAlias(sqlite, 7, 12)).toBe(2);
    sqlite.close();
  });

  it("is a no-op when fromTeamId equals toTeamId", () => {
    const sqlite = makeDb();
    ins(sqlite, "ana|5", 1);
    expect(rewriteLookupKeysForAlias(sqlite, 5, 5)).toBe(0);
    expect(keys(sqlite)).toEqual(["ana|5"]);
    sqlite.close();
  });

  it("preserves the athlete_id when rewriting", () => {
    const sqlite = makeDb();
    ins(sqlite, "joao silva|5", 42);
    rewriteLookupKeysForAlias(sqlite, 5, 10);
    const row = sqlite.prepare("SELECT athlete_id FROM athlete_lookup WHERE key = 'joao silva|10'").get() as { athlete_id: number };
    expect(row.athlete_id).toBe(42);
    sqlite.close();
  });
});

// ── ID stability across scrape simulation ─────────────────────────────────────

describe("athlete ID stability after team alias + lookup rewrite", () => {
  it("preserves athlete ID across scrape when alias is added between runs", () => {
    const sqlite = makeDb();

    // Scrape 1: athlete under team "sporting" (ID 5)
    insTeam(sqlite, "sporting");
    const { id: sportingId } = sqlite.prepare("SELECT id FROM teams WHERE canonical_key = 'sporting'").get() as { id: number };
    ins(sqlite, `joao silva|${sportingId}`, 100);

    // Now add alias "sporting cp" → "sporting" and rewrite lookups
    insTeam(sqlite, "sporting cp");
    const { id: cpId } = sqlite.prepare("SELECT id FROM teams WHERE canonical_key = 'sporting cp'").get() as { id: number };
    sqlite.prepare("UPDATE teams SET alias_keys = json_insert(alias_keys, '$[#]', 'sporting cp') WHERE canonical_key = 'sporting'").run();
    rewriteLookupKeysForAlias(sqlite, cpId, sportingId);

    // Scrape 2: same athlete appears under "sporting cp" which now resolves to sportingId
    // The pipeline would look up `joao silva|${sportingId}` (because teamNormalKey("sporting cp") → "sporting")
    const row = sqlite.prepare(`SELECT athlete_id FROM athlete_lookup WHERE key = ?`).get(`joao silva|${sportingId}`) as { athlete_id: number } | undefined;
    expect(row?.athlete_id).toBe(100);

    sqlite.close();
  });
});
