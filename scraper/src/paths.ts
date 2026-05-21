/**
 * paths.ts
 *
 * All filesystem paths used by the scraper, computed once at startup.
 */

import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = path.join(
  __dirname,
  "..",
  "..",
  "frontend",
  "public",
  "data",
);
export const SCRAPED_EVENTS_PATH = path.join(
  __dirname,
  "..",
  "scraped-events.json",
);
export const DB_ENC_PATH = path.join(DATA_DIR, "data.db.enc");
export const TMP_DB_PATH = path.join(
  os.tmpdir(),
  `granfondo-${process.pid}.db`,
);
