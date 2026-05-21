/**
 * db-client.ts
 *
 * Generic factory for a Drizzle/sql.js database client.
 * Platform-specific concerns (WASM location, fetch URLs, decryption) are
 * injected by the consumer so this module works in any environment.
 *
 * Usage (e.g. in a Vite frontend):
 *   const { getDb } = createDbClient({ fetchWasm, fetchEncryptedDb, decryptDb });
 */

import initSqlJsDefault from "sql.js";
import type { SqlJsStatic } from "sql.js";

type InitSqlJs = (config?: object) => Promise<SqlJsStatic>;
// sql.js ships both CJS and ESM bundles; bundlers sometimes expose the init
// function nested under .default — handle both.
const initSqlJs: InitSqlJs =
  (initSqlJsDefault as unknown as { default?: InitSqlJs }).default ??
  initSqlJsDefault;

import { drizzle } from "drizzle-orm/sql-js";
import * as schema from "./schema.js";

export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export interface DbClientConfig {
  /** Returns the sql-wasm.wasm binary. */
  fetchWasm: () => Promise<ArrayBuffer>;
  /** Returns the AES-GCM encrypted .db.enc file. */
  fetchEncryptedDb: () => Promise<ArrayBuffer>;
  /** Decrypts the encrypted DB buffer and returns the plain SQLite bytes. */
  decryptDb: (enc: ArrayBuffer) => Promise<ArrayBuffer>;
}

export function createDbClient(config: DbClientConfig): {
  getDb: () => Promise<DrizzleDb>;
} {
  let _db: DrizzleDb | null = null;
  let _promise: Promise<DrizzleDb> | null = null;

  return {
    getDb(): Promise<DrizzleDb> {
      if (_db) {
        return Promise.resolve(_db);
      }

      if (!_promise) {
        _promise = (async (): Promise<DrizzleDb> => {
          const wasmBinary = await config.fetchWasm();
          const SQL = await initSqlJs({ wasmBinary });
          const enc = await config.fetchEncryptedDb();
          const dec = await config.decryptDb(enc);
          _db = drizzle(new SQL.Database(new Uint8Array(dec)), { schema });
          return _db;
        })();
      }

      return _promise;
    },
  };
}
