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

  it("loads all keys for the same athlete_id", () => {
    const sqlite = makeDb();
    const db = drizzle(sqlite, { schema });
    // Multiple lookup keys for the same athlete (team variant + solo expansion key).
    // All must be seeded so the pipeline can match any appearance.
    db.insert(schema.athleteLookup).values([
      { key: "pedro gomes|rota dossa",                     athleteId: 137 },
      { key: "pedro gomes|rota d ossa",                    athleteId: 137 },
      { key: "pedro gomes|solo:Masters B Male:2025",        athleteId: 137 },
    ]).run();

    const store = loadIdStore(sqlite);

    expect(store.size).toBe(3);
    expect(store.get("pedro gomes|rota dossa")).toBe(137);
    expect(store.get("pedro gomes|rota d ossa")).toBe(137);
    expect(store.get("pedro gomes|solo:Masters B Male:2025")).toBe(137);
    sqlite.close();
  });

  it("loads multiple athletes with multiple keys each", () => {
    const sqlite = makeDb();
    const db = drizzle(sqlite, { schema });
    db.insert(schema.athleteLookup).values([
      { key: "ana lima|ccbtt elvas",  athleteId: 42 },
      { key: "ana lima|ccbttelvas",   athleteId: 42 },
      { key: "rui costa|",            athleteId: 99 },
    ]).run();

    const store = loadIdStore(sqlite);
    expect(store.size).toBe(3);
    expect(store.get("ana lima|ccbtt elvas")).toBe(42);
    expect(store.get("ana lima|ccbttelvas")).toBe(42);
    expect(store.get("rui costa|")).toBe(99);
    sqlite.close();
  });
});
