import { fetchWithRetry, makeResult, toTitleCase } from "./shared.js";
import type {
  StoredEventResults,
  StoredDistanceResults,
  StoredResult,
} from "@granfondo/database/types";

// Maps TimerSpeed/ChronoRace category abbreviations to canonical names
const CAT: Record<string, string> = {
  "elt m": "Elite Male",
  "elt f": "Elite Female",
  mam: "Masters A Male",
  maf: "Masters A Female",
  mbm: "Masters B Male",
  mbf: "Masters B Female",
  mcm: "Masters C Male",
  mcf: "Masters C Female",
  mdm: "Masters D Male",
  mem: "Masters E Male",
  ebk: "E-Bike",
  cdtm: "Junior Male",
  cdtf: "Junior Female",
  junm: "Junior Male",
  junf: "Junior Female",
  para: "Paracycling",
};

function attribs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const attrRegex = /(\w+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(tag)) !== null) {
    out[match[1]!] = match[2]!;
  }

  return out;
}

// Convert ChronoRace time "04h02'47" → "04:02:47"
function claxTime(t: string): string {
  const m = t.match(/^(\d+)h(\d+)'(\d+)/);
  if (!m) {
    return "";
  }

  return `${m[1]!.padStart(2, "0")}:${m[2]!.padStart(2, "0")}:${m[3]!.padStart(2, "0")}`;
}

type Engage = {
  name: string;
  category: string;
  team: string;
  gender: string;
  distance: string;
};

async function parseClax(
  url: string,
): Promise<{ engages: Map<string, Engage>; times: Map<string, string> }> {
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`TimerSpeed HTTP ${res.status} for ${url}`);
  }

  const xml = await res.text();

  const engages = new Map<string, Engage>();
  for (const m of xml.matchAll(/<E\s((?:"[^"]*"|[^">])*?)\/>/g)) {
    const a = attribs(m[1]!);
    if (!a["d"]) {
      continue;
    }

    engages.set(a["d"], {
      name: toTitleCase(a["n"] ?? ""),
      category: CAT[a["ca"] ?? ""] ?? a["ca"] ?? "",
      team: a["c"] ?? "",
      gender: a["x"] === "F" ? "F" : "M",
      distance: a["p"] ?? "",
    });
  }

  const times = new Map<string, string>();
  for (const m of xml.matchAll(/<R\s((?:"[^"]*"|[^">])*?)\/>/g)) {
    const a = attribs(m[1]!);
    if (a["d"] && a["t"]) {
      times.set(a["d"], a["t"]);
    }
  }

  return { engages, times };
}

function buildDistances(
  engages: Map<string, Engage>,
  times: Map<string, string>,
  _eventId: number,
  distanceConfig: { key: string; id: string; name: string }[],
): StoredDistanceResults[] {
  const byDist = new Map<
    string,
    { bib: string; time: string; eng: Engage }[]
  >();
  for (const [bib, time] of times) {
    const eng = engages.get(bib);
    if (!eng?.distance) {
      continue;
    }

    if (!byDist.has(eng.distance)) {
      byDist.set(eng.distance, []);
    }

    byDist.get(eng.distance)!.push({ bib, time, eng });
  }

  for (const rows of byDist.values()) {
    rows.sort((a, b) => a.time.localeCompare(b.time));
  }

  const distances: StoredDistanceResults[] = [];
  for (const { key, id, name } of distanceConfig) {
    const rows = byDist.get(key) ?? [];
    if (!rows.length) {
      continue;
    }

    const results: StoredResult[] = [];
    for (const row of rows) {
      const raceTime = claxTime(row.time);
      if (!raceTime) {
        continue;
      }

      results.push(
        makeResult({
          pos: results.length + 1,
          bib: row.bib,
          name: row.eng.name,
          gender: row.eng.gender,
          team: row.eng.team.trim() || "Individual",
          category: row.eng.category,
          country: "",
          raceTime,
        }),
      );
    }

    distances.push({ id, name, finisherCount: results.length, results });
  }

  return distances;
}

export async function scrapePortoGaiaGranfondo2024(): Promise<StoredEventResults> {
  const { engages, times } = await parseClax(
    "https://timerspeed.com/live/events/2024/pggf_2024.clax",
  );
  return {
    eventId: 90004,
    eventName: "Porto Gaia Granfondo 2024",
    eventDate: "2024-04-14",
    eventYear: 2024,
    scrapedAt: new Date().toISOString(),
    distances: buildDistances(engages, times, 90004, [
      { key: "GRANFONDO", id: "1", name: "Granfondo" },
      { key: "MEDIOFONDO", id: "2", name: "Mediofondo" },
      { key: "MINIFONDO", id: "3", name: "Minifondo" },
    ]),
  };
}
