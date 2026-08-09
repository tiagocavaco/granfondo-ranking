import {
  BROWSER_UA,
  fetchWithRetry,
  cleanTime,
  makeResult,
  toTitleCase,
} from "./shared.js";
import { normalizeCountry } from "../normalize.js";
import type {
  StoredEventResults,
  StoredDistanceResults,
  StoredResult,
} from "@granfondo/database/types";

/** Minimal CSV parser that handles double-quoted fields. */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.trim());
  if (lines.length < 2) {
    return [];
  }

  function parseLine(line: string): string[] {
    const fields: string[] = [];
    let field = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i]!;
      if (inQuote) {
        if (char === '"' && line[i + 1] === '"') {
          field += '"';
          i++;
        } else if (char === '"') {
          inQuote = false;
        } else {
          field += char;
        }
      } else if (char === '"') {
        inQuote = true;
      } else if (char === ",") {
        fields.push(field);
        field = "";
      } else {
        field += char;
      }
    }

    fields.push(field);
    return fields;
  }

  const headers = parseLine(lines[0]!);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]!);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      if (header) {
        row[header] = values[idx] ?? "";
      }
    });
    rows.push(row);
  }

  return rows;
}

async function waitastartFetch(rParam: string): Promise<StoredResult[]> {
  const url = `https://waitastart.com/results25/files/${rParam.toLowerCase()}.csv`;
  const res = await fetchWithRetry(url, {
    headers: { "User-Agent": BROWSER_UA },
  });
  if (!res.ok) {
    throw new Error(`waitastart HTTP ${res.status}: ${url}`);
  }

  const rows = parseCsv(await res.text());

  const results: StoredResult[] = [];
  for (const r of rows) {
    const status = r["Status Code"] ?? "";
    const isDnf = status === "DNF";
    const isDns = status === "DNS";
    const isFinished = status === "Finished";
    if (!isFinished && !isDnf && !isDns) {
      continue;
    }

    const pos = parseInt(r["RUN.pos"] ?? "0", 10);
    const rawGender = (r["Gender"] ?? "").toLowerCase();
    const gender =
      rawGender === "male" ? "M" : rawGender === "female" ? "F" : "";

    results.push(
      makeResult({
        pos: isFinished ? pos : 0,
        bib: r["Bib"] ?? "",
        name: toTitleCase(r["Name"] ?? ""),
        gender,
        team: r["Club"] ?? "",
        category: r["Category"] ?? "",
        country: normalizeCountry(r["Nationality"]),
        raceTime: isFinished ? cleanTime(r["RUN.toficial"] ?? "") : "",
        dnf: isDnf,
        dns: isDns,
      }),
    );
  }

  results.sort((a, b) => {
    if (a.dns && !b.dns) {
      return 1;
    }

    if (!a.dns && b.dns) {
      return -1;
    }

    if (a.dnf && !b.dnf) {
      return 1;
    }

    if (!a.dnf && b.dnf) {
      return -1;
    }

    return a.pos - b.pos;
  });
  return results;
}

export async function scrapeAgitagueda(): Promise<StoredEventResults> {
  const BASE = "granfondo-agitagueda-2025";
  const [gfResults, mfResults, miniResults] = await Promise.all([
    waitastartFetch(`${BASE}_GRANFONDO`),
    waitastartFetch(`${BASE}_MEDIOFONDO`),
    waitastartFetch(`${BASE}_MINIFONDO`),
  ]);

  const toDistResult = (
    id: string,
    name: string,
    results: StoredResult[],
  ): StoredDistanceResults => ({
    id,
    name,
    finisherCount: results.filter((r) => !r.dnf && !r.dns).length,
    results,
  });

  return {
    eventId: 90002,
    eventName: "Granfondo Agitágueda 2025",
    eventDate: "2025-07-27",
    eventYear: 2025,
    scrapedAt: new Date().toISOString(),
    distances: [
      toDistResult("1", "Granfondo", gfResults),
      toDistResult("2", "Mediofondo", mfResults),
      toDistResult("3", "Minifondo", miniResults),
    ].filter((d) => d.results.length > 0),
  };
}
