/**
 * db-client.ts
 *
 * Vite-specific wiring for the shared @granfondo/database client factory.
 * Provides WASM URL, encrypted DB URL, and Web Crypto decryption.
 */

import { createDbClient } from "@granfondo/database/db-client";
import { decryptDatabase } from "./decrypt";
import sqlWasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";

export type { DrizzleDb } from "@granfondo/database/db-client";

const { getDb } = createDbClient({
  fetchWasm: async () => {
    const r = await fetch(sqlWasmUrl);
    if (!r.ok) throw new Error(`Failed to fetch WASM: ${r.status}`);
    return r.arrayBuffer();
  },
  fetchEncryptedDb: async () => {
    const r = await fetch(`${import.meta.env.BASE_URL}data/data.db.enc`);
    if (!r.ok) throw new Error(`Failed to fetch data.db.enc: ${r.status}`);
    return r.arrayBuffer();
  },
  decryptDb: decryptDatabase,
});

export { getDb };
