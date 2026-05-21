import {
  BROWSER_UA,
  fetchWithRetry,
  cleanTime,
  makeResult,
  toTitleCase,
} from "./shared.js";
import type { StoredEventResults } from "@granfondo/database/types";

export async function scrapeEtapaDaVolta(): Promise<StoredEventResults> {
  const res = await fetchWithRetry(
    "https://www.classificacoes.net/ajax/action/results/13745",
    {
      headers: { "User-Agent": BROWSER_UA },
    },
  );
  if (!res.ok) {
    throw new Error(`classificacoes.net HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    aaData: Array<[string, string, string, string, string, string, string]>;
  };

  const rows = data.aaData
    .map((r) => ({
      pos: parseInt(r[0], 10),
      bib: r[1],
      name: r[2],
      gender: r[3].toUpperCase() === "MALE" ? "M" : "F",
      team: r[4],
      time: cleanTime(r[5]),
    }))
    .filter((r) => r.pos > 0 && r.time);

  rows.sort((a, b) => a.pos - b.pos);

  const results = rows.map((r) =>
    makeResult({
      pos: r.pos,
      bib: r.bib,
      name: toTitleCase(r.name),
      gender: r.gender as "M" | "F",
      team: r.team,
      category: "",
      country: "",
      raceTime: r.time,
    }),
  );

  return {
    eventId: 90004,
    eventName: "Etapa da Volta 2025",
    eventDate: "2025-08-12",
    eventYear: 2025,
    scrapedAt: new Date().toISOString(),
    distances: [
      { id: "1", name: "Mediofondo", finisherCount: results.length, results },
    ],
  };
}
