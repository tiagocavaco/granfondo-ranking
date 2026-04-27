import { describe, it, expect } from "vitest";
import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as path from "path";
import * as schema from "@granfondo/database/schema";
import { loadIdStore } from "./db-loader.js";

const migrationsPath = path.resolve(import.meta.dirname, "../../../database/migrations");

function makeDb(): BetterSqlite3.Database {
  const sqlite = new BetterSqlite3(":memory:");
  migrate(drizzle(sqlite, { schema }), { migrationsFolder: migrationsPath });
  return sqlite;
}

describe("loadIdStore", () => {
  it("returns null-safe empty map", () => {
    expect(loadIdStore(null).size).toBe(0);
  });

  it("loads keys normally when no duplicates", () => {
    const sqlite = makeDb();
    const db = drizzle(sqlite, { schema });
    db.insert(schema.athleteLookup).values([
      { key: "joao silva|sporting", athleteId: 1 },
      { key: "maria costa|benfica",  athleteId: 2 },
    ]).run();

    const store = loadIdStore(sqlite);
    expect(store.get("joao silva|sporting")).toBe(1);
    expect(store.get("maria costa|benfica")).toBe(2);
    sqlite.close();
  });

  it("deduplicates keys that share an athlete_id — old code would load both, corrupting the pipeline", () => {
    const sqlite = makeDb();
    const db = drizzle(sqlite, { schema });
    // Two different keys pointing to the same athlete — this happened when
    // expansion keys were written to athlete_lookup. The old loadIdStore
    // returned both, causing Pass 1 to create two AthleteProfile objects
    // with the same id, crashing with UNIQUE constraint on insert.
    db.insert(schema.athleteLookup).values([
      { key: "pedro gomes|rota dossa",   athleteId: 137 },
      { key: "pedro gomes|rota d ossa",  athleteId: 137 },
    ]).run();

    const store = loadIdStore(sqlite);

    // Only one key must survive — both map to id 137
    const keys = [...store.entries()].filter(([, id]) => id === 137);
    expect(keys).toHaveLength(1);
    expect(store.size).toBe(1);
    sqlite.close();
  });

  it("keeps the first key seen when deduplicating", () => {
    const sqlite = makeDb();
    const db = drizzle(sqlite, { schema });
    db.insert(schema.athleteLookup).values([
      { key: "ana lima|ccbtt elvas",  athleteId: 42 },
      { key: "ana lima|ccbttelvas",   athleteId: 42 },
    ]).run();

    const store = loadIdStore(sqlite);
    expect(store.size).toBe(1);
    expect(store.get("ana lima|ccbtt elvas")).toBe(42);  // first row wins
    sqlite.close();
  });
});
