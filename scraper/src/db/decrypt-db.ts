/**
 * decrypt-db.ts
 *
 * Decrypts data.db.enc to a temporary plain .db file for local inspection.
 * Usage: npm run decrypt-db [output-path]
 *
 * Default output: /tmp/granfondo.db
 * Then open with: sqlite3 /tmp/granfondo.db  OR  DB Browser for SQLite
 */

import * as fs from "fs";
import * as path from "path";
import { decryptBuffer } from "./encrypt.js";

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
const outPath = process.argv[2] ?? "/tmp/granfondo.db";

const enc = fs.readFileSync(encPath);
const plain = decryptBuffer(enc, keyHex);

fs.writeFileSync(outPath, plain);
console.log(`Decrypted DB written to: ${outPath}`);
console.log(`Open with:  sqlite3 ${outPath}`);
console.log(`Or:         DB Browser for SQLite → Open Database`);
