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

type ProgressCallback = (
  phase: "downloading" | "decrypting",
  pct: number,
) => void;
let progressCallback: ProgressCallback | null = null;

export function setDbProgressCallback(cb: ProgressCallback) {
  progressCallback = cb;
}

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

    const MAX_ATTEMPTS = 3;
    const STALL_MS = 30_000;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      try {
        const response = await fetch(dbUrl, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Failed to fetch data.db.enc: ${response.status}`);
        }

        const contentLength = response.headers.get("content-length");
        const total = contentLength ? parseInt(contentLength, 10) : 0;

        if (!total || !response.body) {
          return response.arrayBuffer();
        }

        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;

        while (true) {
          // Abort and retry if no data arrives within STALL_MS
          const { done, value } = await new Promise<
            ReadableStreamReadResult<Uint8Array>
          >((resolve, reject) => {
            const timer = setTimeout(() => {
              controller.abort();
              reject(new Error("stall"));
            }, STALL_MS);
            reader.read().then(
              (result) => {
                clearTimeout(timer);
                resolve(result);
              },
              (err: unknown) => {
                clearTimeout(timer);
                reject(err);
              },
            );
          });

          if (done) {
            break;
          }

          chunks.push(value);
          received += value.length;
          progressCallback?.(
            "downloading",
            Math.round((received / total) * 100),
          );
        }

        progressCallback?.("decrypting", 100);

        const buffer = new Uint8Array(received);
        let position = 0;
        for (const chunk of chunks) {
          buffer.set(chunk, position);
          position += chunk.length;
        }

        return buffer.buffer;
      } catch (err) {
        if (attempt === MAX_ATTEMPTS - 1) {
          throw err;
        }

        // Reset progress indicator before retrying
        progressCallback?.("downloading", 0);
      }
    }

    throw new Error("Failed to fetch data.db.enc after retries");
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
