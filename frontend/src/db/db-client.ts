/**
 * db-client.ts
 *
 * Vite-specific wiring for the shared @granfondo/database client factory.
 * Provides WASM URL, encrypted DB URL, and Web Crypto decryption.
 */

import { createDbClient } from "@granfondo/database/db-client";
import { decryptDatabase } from "@granfondo/database/decrypt";
import sqlWasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";

export type { DrizzleDb } from "@granfondo/database/db-client";

const { getDb } = createDbClient({
  fetchWasm: async () => {
    const r = await fetch(sqlWasmUrl);
    if (!r.ok) {
      throw new Error(`Failed to fetch WASM: ${r.status}`);
    }

    return r.arrayBuffer();
  },
  fetchEncryptedDb: async () => {
    const sha = (import.meta.env.VITE_GIT_SHA as string | undefined) ?? "";
    const url = `${import.meta.env.BASE_URL}data/data.db.enc${sha ? `?v=${sha.slice(0, 8)}` : ""}`;
    const r = await fetch(url);
    if (!r.ok) {
      throw new Error(`Failed to fetch data.db.enc: ${r.status}`);
    }

    return r.arrayBuffer();
  },
  decryptDb: (enc: ArrayBuffer) => {
    const keyHex = import.meta.env.VITE_DATA_KEY as string | undefined;
    if (!keyHex) {
      throw new Error("VITE_DATA_KEY is not set");
    }

    return decryptDatabase(enc, keyHex);
  },
});

export { getDb };
