import { normalizeName, timeToSeconds, normalizeCountry } from "../normalize.js";
import type { StoredResult } from "@granfondo/database/types";

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/** fetch() with exponential backoff. Retries on network errors and 5xx/429. */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = (2 ** (attempt - 1)) * 1000 + Math.random() * 500;
      console.warn(`  ↻ retry ${attempt}/${maxRetries} in ${Math.round(delay)}ms — ${url}`);
      await new Promise((r) => setTimeout(r, delay));
    }
    try {
      const res = await fetch(url, init);
      if (!res.ok && RETRYABLE.has(res.status)) {
        lastErr = new Error(`HTTP ${res.status}: ${url}`);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/** Convert milliseconds to "HH:MM:SS" */
export function msToHHMMSS(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
}

/** Pad single-digit hours: "3:29:24" → "03:29:24", "03:29:24" unchanged */
function padHHMMSS(t: string): string {
  const parts = t.split(":");
  if (parts.length !== 3) return t;
  return [parseInt(parts[0]!), parts[1], parts[2]]
    .map((v, i) => (i === 0 ? String(v).padStart(2, "0") : v))
    .join(":");
}

/** Strip milliseconds from "H:MM:SS.mmm" → "H:MM:SS", then pad */
export function cleanTime(t: string): string {
  return padHHMMSS((t.split(".")[0] ?? t).trim());
}

/** Build a StoredResult from normalised fields */
export function makeResult(fields: {
  pos: number;
  bib: string;
  name: string;
  gender: string;
  team: string;
  category: string;
  country: string;
  raceTime: string;
  dnf?: boolean;
  dns?: boolean;
}): StoredResult {
  const raceTimeSecs = timeToSeconds(fields.raceTime);
  return {
    pos: fields.pos,
    genderPos: 0,
    athleteId: 0,
    bib: fields.bib,
    name: fields.name,
    nameLower: normalizeName(fields.name),
    gender: fields.gender,
    team: fields.team,
    category: fields.category,
    country: normalizeCountry(fields.country),
    raceTime: fields.raceTime,
    raceTimeSecs,
    gap: "",
    gapSecs: 0,
    points: 0,
    licences: [],
    dnf: fields.dnf ?? false,
    dns: fields.dns ?? false,
  };
}

/** Title-case a string (handles all-caps athlete names from some APIs) */
export function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
