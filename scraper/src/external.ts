/**
 * Custom scrapers for granfondo events hosted on platforms other than StopAndGo.
 *
 * Supported platforms:
 *   lap2go.com       – Figueira Champions Day 2025   (ID 90001)
 *   waitastart.com   – Granfondo Agitágueda 2025     (ID 90002)
 *   apedalar.pt      – Granfondo 5 Quinas Sabugal    (ID 90003)
 *   classificacoes.net – Etapa da Volta 2025         (ID 90004)
 */

import type {
  StoredEvent,
  StoredEventResults,
  StoredDistanceResults,
  StoredResult,
  StoredParticipant,
} from "@granfondo/db/types";
import { normalizeName, timeToSeconds } from "./normalize.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

// ── External event definitions ────────────────────────────────────────────────

export const EXTERNAL_EVENTS: StoredEvent[] = [
  {
    id: 90001,
    name: "Figueira Champions Day 2025",
    year: 2025,
    date: "2025-02-15",
    location: "Figueira da Foz",
    resultsUrl: "https://www.lap2go.com/pt/evento/figueira-champions-day-2025",
    officialUrl: null,
    hasResults: false,
    distances: [
      { id: "1", name: "Granfondo" },
      { id: "2", name: "Mediofondo" },
    ],
    participantCount: 0,
    finisherCount: 0,
    scrapedAt: null,
  },
  {
    id: 90002,
    name: "Granfondo Agitágueda 2025",
    year: 2025,
    date: "2025-07-27",
    location: "Águeda",
    resultsUrl: "https://www.waitastart.com/events/granfondo-agitagueda-2025",
    officialUrl: null,
    hasResults: false,
    distances: [
      { id: "1", name: "Granfondo" },
      { id: "2", name: "Mediofondo" },
      { id: "3", name: "Minifondo" },
    ],
    participantCount: 0,
    finisherCount: 0,
    scrapedAt: null,
  },
  {
    id: 90003,
    name: "Granfondo 5 Quinas Sabugal 2025",
    year: 2025,
    date: "2025-06-01",
    location: "Sabugal",
    resultsUrl: "https://apedalar.pt/eventos/3818/resultados",
    officialUrl: null,
    hasResults: false,
    distances: [
      { id: "1", name: "Granfondo" },
      { id: "2", name: "Mediofondo" },
    ],
    participantCount: 0,
    finisherCount: 0,
    scrapedAt: null,
  },
  {
    id: 90004,
    name: "Etapa da Volta 2025",
    year: 2025,
    date: "2025-08-12",
    location: "Viseu",
    resultsUrl: "https://www.classificacoes.net/modalidades/ciclismo/18-etapa-da-volta-rtp#results",
    officialUrl: null,
    hasResults: false,
    distances: [{ id: "1", name: "Etapa" }],
    participantCount: 0,
    finisherCount: 0,
    scrapedAt: null,
  },
];

/** Upcoming events with no StopAndGo ID yet — shown in the events list but not scraped. */
export const MANUAL_UPCOMING_EVENTS: StoredEvent[] = [
  {
    id: 90011,
    name: "Granfondo Terras de Basto 2026",
    year: 2026,
    date: "2026-06-21",
    location: "Mondim de Basto",
    resultsUrl: "https://cabreirasolutions.com/evento/granfondo-terras-de-basto/",
    officialUrl: null,
    hasResults: false,
    distances: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
    participantCount: 0,
    finisherCount: 0,
    scrapedAt: null,
  },
  {
    id: 90012,
    name: "Granfondo 5 Quinas Sabugal 2026",
    year: 2026,
    date: "2026-07-05",
    location: "Sabugal",
    resultsUrl: "https://apedalar.pt/eventos/4197/info",
    officialUrl: null,
    hasResults: false,
    distances: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }],
    participantCount: 0,
    finisherCount: 0,
    scrapedAt: null,
  },
  {
    id: 90013,
    name: "Granfondo Paredes 2026",
    year: 2026,
    date: "2026-07-26",
    location: "Paredes",
    resultsUrl: "https://cabreirasolutions.com/evento/granfondo-paredes/",
    officialUrl: null,
    hasResults: false,
    distances: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
    participantCount: 0,
    finisherCount: 0,
    scrapedAt: null,
  },
  {
    id: 90014,
    name: "Etapa da Volta 2026",
    year: 2026,
    date: "2026-08-11",
    location: "Viseu",
    resultsUrl: "https://www.classificacoes.net",
    officialUrl: null,
    hasResults: false,
    distances: [{ id: "1", name: "Etapa" }],
    participantCount: 0,
    finisherCount: 0,
    scrapedAt: null,
  },
  {
    id: 90015,
    name: "Granfondo Serra d'Ossa 2026",
    year: 2026,
    date: "2026-10-04",
    location: "Estremoz",
    resultsUrl: "https://cabreirasolutions.com/evento/granfondo-serra-dossa/",
    officialUrl: null,
    hasResults: false,
    distances: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
    participantCount: 0,
    finisherCount: 0,
    scrapedAt: null,
  },
  {
    id: 90016,
    name: "Granfondo Portimão 2026",
    year: 2026,
    date: "2026-11-08",
    location: "Portimão",
    resultsUrl: "https://cabreirasolutions.com/evento/granfondo-portimao/",
    officialUrl: null,
    hasResults: false,
    distances: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
    participantCount: 0,
    finisherCount: 0,
    scrapedAt: null,
  },
];

// ── stopandgo.net/lista/ participant scraper ──────────────────────────────────

/**
 * Scrape confirmed participants from a stopandgo.net/lista/{slug}/ page.
 * The page is server-rendered HTML with a DataTable; each row has:
 *   td[0]=dorsal, td[1]=name, td[2]=percurso, td[3]=escalão, td[4]=equipa
 *   td[5]=<span hidden>{status}</span><span class="badge">…</span>
 *     status: 1=Confirmado, -1=Pendente, 0=Anulado
 *
 * Gender is derived from the escalão field (suffix "FEM" → F, else M).
 * Distance ID is derived from the distance name position (1=GF, 2=MF, 3=Mini).
 */
export async function scrapeListaParticipants(url: string): Promise<StoredParticipant[]> {
  const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
  if (!res.ok) throw new Error(`lista HTTP ${res.status}: ${url}`);
  const html = await res.text();

  const athletes: StoredParticipant[] = [];

  // Extract all <tr> blocks
  const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  for (const trMatch of html.matchAll(trPattern)) {
    const row = trMatch[1]!;
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
      m[1]!.replace(/<[^>]+>/g, "").trim()
    );
    if (tds.length < 6) continue;

    // Extract numeric status from hidden span: <span hidden>1</span>
    const statusMatch = row.match(/<span hidden>([-\d]+)<\/span>/);
    const status = statusMatch ? parseInt(statusMatch[1]!, 10) : 0;
    if (status !== 1) continue; // only Confirmado

    const bib = tds[0] ?? "";
    const name = tds[1] ?? "";
    const distance = tds[2] ?? "";
    const category = tds[3] ?? "";
    const team = tds[4] ?? "";

    if (!name) continue;

    // Derive gender from category (e.g. "MASTERS A FEM" → F)
    const gender = category.toUpperCase().includes("FEM") ? "F" : "M";

    // Map distance name to ID (positional: GF=1, MF=2, Mini=3)
    const distLower = distance.toLowerCase();
    const distanceId =
      distLower.includes("granfondo") || distLower.includes("grandfondo") ? "1"
      : distLower.includes("mediofondo") ? "2"
      : distLower.includes("minifondo") ? "3"
      : "1";

    athletes.push({
      bib,
      name,
      fullName: name,
      gender,
      team,
      category,
      distance,
      distanceId,
    });
  }

  return athletes;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Convert milliseconds to "HH:MM:SS" */
function msToHHMMSS(ms: number): string {
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
function cleanTime(t: string): string {
  return padHHMMSS((t.split(".")[0] ?? t).trim());
}

/** Build a StoredResult from normalised fields */
function makeResult(fields: {
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
    genderPos: 0,  // filled in by the caller after all results are collected
    athleteId: 0,  // filled in after athlete index is built
    bib: fields.bib,
    name: fields.name,
    nameLower: normalizeName(fields.name),
    gender: fields.gender,
    team: fields.team,
    category: fields.category,
    country: fields.country,
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
function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── 1. lap2go.com — Figueira Champions Day ───────────────────────────────────

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
  numPassagem: number
): Promise<Lap2GoRow[]> {
  const res = await fetch("https://api.lap2go.com/Evento-Resultados", {
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
  if (!res.ok) throw new Error(`lap2go HTTP ${res.status} for ${nomeProva}`);
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
      country: r.Pais ?? "",
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

// ── 2. waitastart.com — Granfondo Agitágueda ─────────────────────────────────

/** Minimal CSV parser that handles double-quoted fields. */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  function parseLine(line: string): string[] {
    const fields: string[] = [];
    let field = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (inQuote) {
        if (ch === '"' && line[i + 1] === '"') {
          field += '"';
          i++;
        } else if (ch === '"') {
          inQuote = false;
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuote = true;
      } else if (ch === ",") {
        fields.push(field);
        field = "";
      } else {
        field += ch;
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
    headers.forEach((h, idx) => {
      if (h) row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

async function waitastartFetch(rParam: string): Promise<StoredResult[]> {
  const url = `https://waitastart.com/results25/files/${rParam.toLowerCase()}.csv`;
  const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
  if (!res.ok) throw new Error(`waitastart HTTP ${res.status}: ${url}`);
  const text = await res.text();
  const rows = parseCsv(text);

  const results: StoredResult[] = [];
  for (const r of rows) {
    const status = r["Status Code"] ?? "";
    const isDnf = status === "DNF";
    const isDns = status === "DNS";
    const isFinished = status === "Finished";
    if (!isFinished && !isDnf && !isDns) continue;

    const pos = parseInt(r["RUN.pos"] ?? "0", 10);
    const rawGender = (r["Gender"] ?? "").toLowerCase();
    const gender = rawGender === "male" ? "M" : rawGender === "female" ? "F" : "";

    results.push(
      makeResult({
        pos: isFinished ? pos : 0,
        bib: r["Bib"] ?? "",
        name: r["Name"] ?? "",
        gender,
        team: r["Club"] ?? "",
        category: r["Category"] ?? "",
        country: r["Nationality"] ?? "",
        raceTime: isFinished ? cleanTime(r["RUN.toficial"] ?? "") : "",
        dnf: isDnf,
        dns: isDns,
      })
    );
  }
  results.sort((a, b) => {
    if (a.dns && !b.dns) return 1;
    if (!a.dns && b.dns) return -1;
    if (a.dnf && !b.dnf) return 1;
    if (!a.dnf && b.dnf) return -1;
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
    results: StoredResult[]
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

// ── 3. apedalar.pt — Granfondo 5 Quinas Sabugal ──────────────────────────────

/** Decode HTML attribute entities (for wire:snapshot attribute values) */
function htmlAttrDecode(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

interface ApedalarRow {
  pos: number;
  bib: string;
  name: string;
  team: string;
  time: string; // "H:MM:SS.mmm"
  gender: "M" | "F";
  category: string;
}

/**
 * Extract escalao (category) options from the initial page HTML or snapshot.
 * Returns an empty array if none found.
 */
export function extractEscalaoOptions(html: string, snapshot: string): string[] {
  // Try: <select wire:model[.live]="escalao"> or wire:model.live='escalao'
  const selectMatch = html.match(
    /<select[^>]+wire:model(?:\.\w+)?=['"]escalao['"][^>]*>([\s\S]*?)<\/select>/
  );
  if (selectMatch) {
    const opts = [...selectMatch[1]!.matchAll(/<option[^>]+value=['"]([^'"]+)['"]/g)]
      .map((m) => m[1]!.trim())
      .filter(Boolean);
    if (opts.length > 0) return opts;
  }
  // Try snapshot data.escaloes array
  try {
    const snap = JSON.parse(snapshot) as { data?: { escaloes?: unknown } };
    const escaloes = snap.data?.escaloes;
    if (Array.isArray(escaloes)) {
      const vals = (escaloes as unknown[]).filter((e) => typeof e === "string" && e) as string[];
      if (vals.length > 0) return vals;
    }
  } catch {
    // ignore parse errors
  }
  return [];
}

/** Derive gender from escalao name: FEM/F suffix → F, else M */
export function escalaoToGender(escalao: string): "M" | "F" {
  const u = escalao.toUpperCase();
  if (u.endsWith(" F") || u.includes("FEM") || u.endsWith(" FEMI")) return "F";
  return "M";
}

/** Parse result rows from Livewire-rendered HTML or initial page */
function parseApedalarRows(html: string, gender: "M" | "F"): ApedalarRow[] {
  const rows: ApedalarRow[] = [];
  const trMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g);
  for (const m of trMatches) {
    const row = m[1]!;
    if (!row.includes("<td")) continue;

    // Desktop: <td class="hidden sm:table-cell py-3 text-center font-semibold">N</td>
    const posMatch = row.match(
      /hidden sm:table-cell py-3 text-center font-semibold"[^>]*>(\d+)</
    );
    if (!posMatch) continue;

    // bib and time are both font-mono cells
    const monoValues = [
      ...row.matchAll(/hidden sm:table-cell px-4 py-3 font-mono"[^>]*>([^<]+)</g),
    ].map((x) => x[1]!.trim());

    const nameMatch = row.match(/hidden sm:table-cell px-4 py-3"[^>]*>([^<]+)</);
    const teamMatch = row.match(/hidden lg:table-cell px-4 py-3"[^>]*>([^<]+)</);

    if (!nameMatch) continue;

    rows.push({
      pos: parseInt(posMatch[1]!, 10),
      bib: monoValues[0] ?? "",
      name: nameMatch[1]!.trim(),
      team: teamMatch?.[1]?.trim() ?? "",
      time: monoValues[1] ?? "",
      gender,
      category: "",
    });
  }
  return rows;
}

/** Sort rows by time (tiebreak: server-assigned pos), assign overall positions, produce StoredResult[] */
function combineAndRankByTime(rows: ApedalarRow[]): StoredResult[] {
  rows.sort((a, b) => {
    const dt = timeToSeconds(cleanTime(a.time)) - timeToSeconds(cleanTime(b.time));
    if (dt !== 0) return dt;
    return a.pos - b.pos; // preserve official server ordering on equal times
  });
  return rows.map((r, i) =>
    makeResult({
      pos: i + 1,
      bib: r.bib,
      name: r.name,
      gender: r.gender,
      team: r.team,
      category: r.category,
      country: "",
      raceTime: cleanTime(r.time),
    })
  );
}

async function apedalarLivewireFetch(
  livewireUri: string,
  snapshot: string,
  updates: Record<string, string>,
  cookieStr: string,
  csrf: string
): Promise<{ snapshot: string; html: string }> {
  const payload = {
    _token: csrf,
    components: [
      {
        snapshot,
        updates,
        calls: [
          {
            method: "$commit",
            params: [],
            metadata: { type: "model.live" },
          },
        ],
      },
    ],
  };

  const res = await fetch(livewireUri, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "*/*",
      "X-Livewire": "1",
      "User-Agent": BROWSER_UA,
      Cookie: cookieStr,
      Origin: "https://apedalar.pt",
      Referer: "https://apedalar.pt/eventos/3818/resultados",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`apedalar Livewire HTTP ${res.status}`);
  const data = (await res.json()) as {
    components: Array<{
      snapshot: string;
      effects?: { html?: string };
    }>;
  };
  const comp = data.components[0]!;
  return {
    snapshot: comp.snapshot,
    html: comp.effects?.html ?? "",
  };
}

export async function scrapeApedalar5Quinas(): Promise<StoredEventResults> {
  // 1. Fetch initial page — default state: Granfondo 124km + Masculino
  const pageRes = await fetch("https://apedalar.pt/eventos/3818/resultados", {
    headers: { "User-Agent": BROWSER_UA },
  });
  if (!pageRes.ok)
    throw new Error(`apedalar page HTTP ${pageRes.status}`);

  // Extract session cookies
  const rawSetCookie =
    typeof (pageRes.headers as any).getSetCookie === "function"
      ? ((pageRes.headers as any).getSetCookie() as string[])
      : [pageRes.headers.get("set-cookie") ?? ""];

  const cookieStr = rawSetCookie
    .filter(Boolean)
    .map((h) => h.split(";")[0]!)
    .join("; ");

  const pageHtml = await pageRes.text();

  // Extract CSRF token from livewireScriptConfig
  const csrfMatch = pageHtml.match(/"csrf":"([^"]+)"/);
  if (!csrfMatch) throw new Error("apedalar: CSRF token not found");
  const csrf = csrfMatch[1]!;

  // Extract Livewire update URI
  const uriMatch = pageHtml.match(/"uri":"(https:[^"]+)"/);
  if (!uriMatch) throw new Error("apedalar: Livewire URI not found");
  const livewireUri = uriMatch[1]!.replace(/\\\//g, "/");

  // Extract tempos-table snapshot
  let initialSnapshot = "";
  for (const m of pageHtml.matchAll(/wire:snapshot="([^"]+)"/g)) {
    const decoded = htmlAttrDecode(m[1]!);
    try {
      const snap = JSON.parse(decoded) as { memo?: { name?: string } };
      if (snap.memo?.name === "frontend.tempos.tempos-table") {
        initialSnapshot = decoded;
        break;
      }
    } catch {
      continue;
    }
  }
  if (!initialSnapshot) throw new Error("apedalar: component snapshot not found");

  // 2. Extract escalao (category) options from the page
  const escalaoOptions = extractEscalaoOptions(pageHtml, initialSnapshot);

  const percursoConfigs = [
    { distId: "1", distName: "Granfondo", percursoValue: "Granfondo 124km" },
    { distId: "2", distName: "Mediofondo", percursoValue: "Mediofondo 86km" },
  ] as const;

  const distances: StoredDistanceResults[] = [];

  if (escalaoOptions.length > 0) {
    // Two-phase approach to preserve official server ordering:
    //   Phase 1 — fetch base HTML (escalao="") per gender+distance → correct pos from server
    //   Phase 2 — fetch per-escalao → bib→category lookup only
    // Annotate the officially-ordered base rows with categories, then combine.
    //
    // This preserves the server's tiebreak ordering (e.g. same finish time, photo finish).
    // Per-escalao rows have pos=rank within escalao, NOT overall — so they can't be used
    // for overall ordering directly.
    //
    // IMPORTANT: Livewire ignores escalao when multiple properties are updated at once.
    // Use single-property updates only.
    const gfFBase = await apedalarLivewireFetch(
      livewireUri, initialSnapshot, { sexo: "F" }, cookieStr, csrf
    );
    const mfMBase = await apedalarLivewireFetch(
      livewireUri, initialSnapshot, { percurso: "Mediofondo 86km" }, cookieStr, csrf
    );
    const mfFBase = await apedalarLivewireFetch(
      livewireUri, mfMBase.snapshot, { sexo: "F" }, cookieStr, csrf
    );

    const distConfigs = [
      {
        distId: "1", distName: "Granfondo",
        mSnapshot: initialSnapshot, mBaseHtml: pageHtml,
        fBase: gfFBase,
      },
      {
        distId: "2", distName: "Mediofondo",
        mSnapshot: mfMBase.snapshot, mBaseHtml: mfMBase.html,
        fBase: mfFBase,
      },
    ] as const;

    for (const { distId, distName, mSnapshot, mBaseHtml, fBase } of distConfigs) {
      // Phase 1: base rows with official server pos (pos = overall rank within gender)
      const mBaseRows = parseApedalarRows(mBaseHtml, "M");
      const fBaseRows = parseApedalarRows(fBase.html, "F");

      // Phase 2: build bib→category from per-escalao fetches
      const bibCategory = new Map<string, string>();

      for (const escalao of escalaoOptions) {
        try {
          const resp = await apedalarLivewireFetch(livewireUri, mSnapshot, { escalao }, cookieStr, csrf);
          for (const r of parseApedalarRows(resp.html, "M")) {
            if (r.bib) bibCategory.set(r.bib, escalao);
          }
        } catch (err) {
          console.warn(`apedalar: failed to fetch ${distName}/${escalao}: ${err}`);
        }
      }

      const fEscalaoOptions = extractEscalaoOptions(fBase.html, fBase.snapshot);
      for (const escalao of fEscalaoOptions) {
        try {
          const resp = await apedalarLivewireFetch(livewireUri, fBase.snapshot, { escalao }, cookieStr, csrf);
          for (const r of parseApedalarRows(resp.html, "F")) {
            if (r.bib) bibCategory.set(r.bib, escalao);
          }
        } catch (err) {
          console.warn(`apedalar: failed to fetch ${distName}/${escalao}: ${err}`);
        }
      }

      // Phase 3: annotate base rows with categories, combine, rank
      const allRows = [...mBaseRows, ...fBaseRows];
      for (const r of allRows) r.category = bibCategory.get(r.bib) ?? "";

      if (allRows.length > 0) {
        const results = combineAndRankByTime(allRows);
        distances.push({
          id: distId,
          name: distName,
          finisherCount: results.length,
          results,
        });
      }
    }
  } else {
    // Fallback: no category info — fetch by gender only
    console.warn("apedalar: no escalao options found, fetching without category data");
    const gfMRows = parseApedalarRows(pageHtml, "M");

    const gfFResp = await apedalarLivewireFetch(livewireUri, initialSnapshot, { sexo: "F" }, cookieStr, csrf);
    const gfFRows = parseApedalarRows(gfFResp.html, "F");

    const mfMResp = await apedalarLivewireFetch(livewireUri, initialSnapshot, { percurso: "Mediofondo 86km" }, cookieStr, csrf);
    const mfMRows = parseApedalarRows(mfMResp.html, "M");

    const mfFResp = await apedalarLivewireFetch(livewireUri, mfMResp.snapshot, { sexo: "F" }, cookieStr, csrf);
    const mfFRows = parseApedalarRows(mfFResp.html, "F");

    const gfResults = combineAndRankByTime([...gfMRows, ...gfFRows]);
    const mfResults = combineAndRankByTime([...mfMRows, ...mfFRows]);
    if (gfResults.length) distances.push({ id: "1", name: "Granfondo", finisherCount: gfResults.length, results: gfResults });
    if (mfResults.length) distances.push({ id: "2", name: "Mediofondo", finisherCount: mfResults.length, results: mfResults });
  }

  return {
    eventId: 90003,
    eventName: "Granfondo 5 Quinas Sabugal 2025",
    eventDate: "2025-06-01",
    eventYear: 2025,
    scrapedAt: new Date().toISOString(),
    distances,
  };
}

// ── 4. classificacoes.net — Etapa da Volta ───────────────────────────────────

export async function scrapeEtapaDaVolta(): Promise<StoredEventResults> {
  const res = await fetch(
    "https://www.classificacoes.net/ajax/action/results/13745",
    { headers: { "User-Agent": BROWSER_UA } }
  );
  if (!res.ok) throw new Error(`classificacoes.net HTTP ${res.status}`);

  const data = (await res.json()) as {
    aaData: Array<[string, string, string, string, string, string, string]>;
  };

  // Row format: [pos, dorsal, name, gender, team, time, diploma_html]
  // Positions are overall (all genders), time format "H:MM:SS"
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
    })
  );

  return {
    eventId: 90004,
    eventName: "Etapa da Volta 2025",
    eventDate: "2025-08-12",
    eventYear: 2025,
    scrapedAt: new Date().toISOString(),
    distances: [
      {
        id: "1",
        name: "Etapa",
        finisherCount: results.length,
        results,
      },
    ],
  };
}
