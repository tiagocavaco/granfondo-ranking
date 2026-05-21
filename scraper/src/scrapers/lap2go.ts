import {
  msToHHMMSS,
  fetchWithRetry,
  makeResult,
  toTitleCase,
} from "./shared.js";
import { normalizeCountry } from "../normalize.js";
import type {
  StoredEventResults,
  StoredDistanceResults,
  StoredResult,
} from "@granfondo/database/types";

interface Lap2GoRow {
  Posicao: number;
  Dorsal: number;
  Sexo: string;
  Atleta: string;
  Escalao: string;
  Pais: string;
  Clube: string;
  TempoOficial: number; // ms
}

async function lap2goFetch(
  alias: string,
  nomeProva: string,
  numPassagem: number,
): Promise<Lap2GoRow[]> {
  const res = await fetchWithRetry("https://api.lap2go.com/Evento-Resultados", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apik: "26m6E[AMYYuJ;,5",
      alias,
      nomeProva,
      nomeSerie: "A",
      numPassagem,
    }),
  });
  if (!res.ok) {
    throw new Error(`lap2go HTTP ${res.status} for ${nomeProva}`);
  }

  const data = (await res.json()) as { Resultados?: Lap2GoRow[] };
  return data.Resultados ?? [];
}

export async function scrapeFigueiraChampionsDay(): Promise<StoredEventResults> {
  const [gfRows, mfRows] = await Promise.all([
    lap2goFetch("figueira-champions-day-2025", "Granfondo", 4),
    lap2goFetch("figueira-champions-day-2025", "Mediofondo", 2),
  ]);

  const toResult = (r: Lap2GoRow): StoredResult =>
    makeResult({
      pos: r.Posicao,
      bib: String(r.Dorsal),
      name: toTitleCase(r.Atleta),
      gender: r.Sexo ?? "",
      team: r.Clube ?? "",
      category: r.Escalao ?? "",
      country: normalizeCountry(r.Pais),
      raceTime: msToHHMMSS(r.TempoOficial),
    });

  const gfResults = gfRows.filter((r) => r.Posicao > 0).map(toResult);
  const mfResults = mfRows.filter((r) => r.Posicao > 0).map(toResult);
  gfResults.sort((a, b) => a.pos - b.pos);
  mfResults.sort((a, b) => a.pos - b.pos);

  const distances: StoredDistanceResults[] = [];
  if (gfResults.length) {
    distances.push({
      id: "1",
      name: "Granfondo",
      finisherCount: gfResults.length,
      results: gfResults,
    });
  }

  if (mfResults.length) {
    distances.push({
      id: "2",
      name: "Mediofondo",
      finisherCount: mfResults.length,
      results: mfResults,
    });
  }

  return {
    eventId: 90001,
    eventName: "Figueira Champions Day 2025",
    eventDate: "2025-02-15",
    eventYear: 2025,
    scrapedAt: new Date().toISOString(),
    distances,
  };
}
