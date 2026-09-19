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
    const response = await fetch(sqlWasmUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch WASM: ${response.status}`);
    }

    return response.arrayBuffer();
  },
  fetchEncryptedDb: async () => {
    const gitSha = (import.meta.env.VITE_GIT_SHA as string | undefined) ?? "";
    const dbUrl = `${import.meta.env.BASE_URL}data/data.db.enc${gitSha ? `?v=${gitSha.slice(0, 8)}` : ""}`;
    const response = await fetch(dbUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch data.db.enc: ${response.status}`);
    }

    return response.arrayBuffer();
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
