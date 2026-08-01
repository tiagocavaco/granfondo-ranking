import {
  BROWSER_UA,
  fetchWithRetry,
  cleanTime,
  makeResult,
  decodeHtmlEntities,
} from "./shared.js";
import { timeToSeconds, formatGapSecs } from "../normalize.js";
import type {
  StoredEventResults,
  StoredDistanceResults,
  StoredResult,
  StoredParticipant,
} from "@granfondo/database/types";

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
  gap: string; // "H:MM:SS.mmm" or "-:--:--.---" for winner
  gender: "M" | "F";
  category: string;
}

/**
 * Extract escalao (category) options from the initial page HTML or snapshot.
 * Returns an empty array if none found.
 */
export function extractEscalaoOptions(
  html: string,
  snapshot: string,
): string[] {
  const selectMatch = html.match(
    /<select[^>]+wire:model(?:\.\w+)?=['"]escalao['"][^>]*>([\s\S]*?)<\/select>/,
  );
  if (selectMatch) {
    const opts = [
      ...selectMatch[1]!.matchAll(/<option[^>]+value=['"]([^'"]+)['"]/g),
    ]
      .map((m) => m[1]!.trim())
      .filter(Boolean);
    if (opts.length > 0) {
      return opts;
    }
  }

  try {
    const snap = JSON.parse(snapshot) as { data?: { escaloes?: unknown } };
    const escaloes = snap.data?.escaloes;
    if (Array.isArray(escaloes)) {
      const vals = (escaloes as unknown[]).filter(
        (e) => typeof e === "string" && e,
      ) as string[];
      if (vals.length > 0) {
        return vals;
      }
    }
  } catch (err) {
    console.warn(
      `apedalar: failed to parse escalao options from snapshot: ${err}`,
    );
  }

  return [];
}

/** Derive gender from escalao name: FEM/F suffix → F, else M */
export function escalaoToGender(escalao: string): "M" | "F" {
  const upper = escalao.toUpperCase();
  if (
    upper.endsWith(" F") ||
    upper.includes("FEM") ||
    upper.endsWith(" FEMI")
  ) {
    return "F";
  }

  return "M";
}

function parseApedalarRows(html: string, gender: "M" | "F"): ApedalarRow[] {
  const rows: ApedalarRow[] = [];
  const trMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g);
  for (const m of trMatches) {
    const row = m[1]!;
    if (!row.includes("<td")) {
      continue;
    }

    const posMatch = row.match(
      /hidden sm:table-cell py-3 text-center font-semibold"[^>]*>(\d+)</,
    );
    if (!posMatch) {
      continue;
    }

    const monoValues = [
      ...row.matchAll(
        /hidden sm:table-cell px-4 py-3 font-mono"[^>]*>([^<]+)</g,
      ),
    ].map((x) => x[1]!.trim());

    const nameMatch = row.match(
      /hidden sm:table-cell px-4 py-3"[^>]*>([^<]+)</,
    );
    const teamMatch = row.match(
      /hidden lg:table-cell px-4 py-3"[^>]*>([^<]+)</,
    );
    const gapMatch = row.match(
      /hidden xl:table-cell px-4 py-3 font-mono"[^>]*>([^<]+)</,
    );

    if (!nameMatch) {
      continue;
    }

    rows.push({
      pos: parseInt(posMatch[1]!, 10),
      bib: monoValues[0] ?? "",
      name: nameMatch[1]!.trim(),
      team: teamMatch?.[1]?.trim() ?? "",
      time: monoValues[1] ?? "",
      gap: gapMatch?.[1]?.trim() ?? "",
      gender,
      category: "",
    });
  }

  return rows;
}

/** Sort rows by time (tiebreak: server-assigned pos), assign overall positions, produce StoredResult[] */
function combineAndRankByTime(rows: ApedalarRow[]): StoredResult[] {
  rows.sort((a, b) => {
    const timeDiff = timeToSeconds(a.time) - timeToSeconds(b.time);
    if (timeDiff !== 0) {
      return timeDiff;
    }

    return a.pos - b.pos;
  });
  return rows.map((r, i) => {
    const gapSecs = r.gap && r.gap !== "-:--:--.---" ? timeToSeconds(r.gap) : 0;
    return makeResult({
      pos: i + 1,
      bib: r.bib,
      name: r.name,
      gender: r.gender,
      team: r.team,
      category: r.category,
      country: "",
      raceTime: cleanTime(r.time),
      gap: formatGapSecs(gapSecs),
      gapSecs,
    });
  });
}

async function apedalarLivewireFetch(
  livewireUri: string,
  snapshot: string,
  updates: Record<string, string>,
  cookieStr: string,
  csrf: string,
  referer: string,
): Promise<{ snapshot: string; html: string }> {
  const payload = {
    _token: csrf,
    components: [
      {
        snapshot,
        updates,
        calls: [
          { method: "$commit", params: [], metadata: { type: "model.live" } },
        ],
      },
    ],
  };

  const res = await fetchWithRetry(livewireUri, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "*/*",
      "X-Livewire": "1",
      "User-Agent": BROWSER_UA,
      Cookie: cookieStr,
      Origin: "https://apedalar.pt",
      Referer: referer,
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`apedalar Livewire HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    components: Array<{ snapshot: string; effects?: { html?: string } }>;
  };
  const comp = data.components[0]!;
  return { snapshot: comp.snapshot, html: comp.effects?.html ?? "" };
}

/**
 * Scrape confirmed participants from an apedalar.pt event info page.
 * Paginates via ?page=N until a page returns no data rows.
 *
 * Column layout (wire:key="table-row-*" rows):
 *   td[0]=country flag, td[1]=name, td[2]=team, td[3]=bib,
 *   td[4]=distance, td[5]=category, td[6]=payment status, td[7]=mobile-only
 *
 * Gender is derived from the category prefix: "F" → female, else male.
 * Status: td[6] text contains "PAGO" for confirmed inscriptions.
 */
export async function scrapeApedalarParticipants(
  url: string,
): Promise<StoredParticipant[]> {
  const baseUrl = url.replace(/[?&]page=\d+(&|$)/, "$1").replace(/\?$/, "");
  const all: StoredParticipant[] = [];

  for (let page = 1; page <= 100; page++) {
    const pageUrl = page === 1 ? baseUrl : `${baseUrl}?page=${page}`;
    const res = await fetchWithRetry(pageUrl, {
      headers: { "User-Agent": BROWSER_UA },
    });
    if (!res.ok) {
      if (page === 1) {
        throw new Error(`apedalar participants HTTP ${res.status}: ${pageUrl}`);
      }

      break;
    }

    const html = await res.text();

    const rowPattern =
      /<tr[^>]*wire:key="table-row-\d+"[^>]*>([\s\S]*?)<\/tr>/g;
    let rowCount = 0;
    for (const trMatch of html.matchAll(rowPattern)) {
      rowCount++;
      const row = trMatch[1]!;
      const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(
        (m) => m[1]!,
      );
      if (tds.length < 6) {
        continue;
      }

      // td[1] = name: strip mobile-only divs (md:hidden), then all tags, then collapse whitespace
      const nameTd = decodeHtmlEntities(
        (tds[1] ?? "")
          .replace(/<div[^>]*md:hidden[^>]*>[\s\S]*?<\/div>/g, "")
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim(),
      );
      if (!nameTd) {
        continue;
      }

      const team = decodeHtmlEntities(
        (tds[2] ?? "").replace(/<[^>]+>/g, "").trim(),
      );
      const bib = (tds[3] ?? "").replace(/<[^>]+>/g, "").trim();
      const distance = (tds[4] ?? "").replace(/<[^>]+>/g, "").trim();
      const category = (tds[5] ?? "").replace(/<[^>]+>/g, "").trim();
      const statusRaw = (tds[6] ?? "")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
      if (!statusRaw.includes("PAGO")) {
        continue;
      }

      const gender: "M" | "F" = category.toUpperCase().startsWith("F")
        ? "F"
        : "M";
      const distLower = distance.toLowerCase();
      const distanceId =
        distLower.includes("granfondo") || distLower.includes("grandfondo")
          ? "1"
          : distLower.includes("mediofondo")
            ? "2"
            : distLower.includes("minifondo")
              ? "3"
              : "1";

      all.push({
        bib,
        name: nameTd,
        fullName: nameTd,
        gender,
        team,
        category,
        distance,
        distanceId,
        athleteId: 0,
      });
    }

    if (rowCount === 0) {
      break;
    }
  }

  return all;
}

export interface ApedalarEventConfig {
  eventId: number;
  eventName: string;
  eventDate: string;
  eventYear: number;
  resultsUrl: string;
}

function extractPercursoNames(snapshot: string): string[] {
  try {
    const parsed = JSON.parse(snapshot) as {
      data?: { percursos?: [string[], unknown] };
    };
    return parsed.data?.percursos?.[0] ?? [];
  } catch {
    return [];
  }
}

export async function scrapeApedalarEvent(
  config: ApedalarEventConfig,
): Promise<StoredEventResults> {
  const pageRes = await fetchWithRetry(config.resultsUrl, {
    headers: { "User-Agent": BROWSER_UA },
  });
  if (!pageRes.ok) {
    throw new Error(`apedalar page HTTP ${pageRes.status}`);
  }

  // Node 18+ Headers exposes getSetCookie() but it's absent from the lib DOM types.
  const headers = pageRes.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const rawSetCookie =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [pageRes.headers.get("set-cookie") ?? ""];
  const cookieStr = rawSetCookie
    .filter(Boolean)
    .map((header) => header.split(";")[0]!)
    .join("; ");

  const pageHtml = await pageRes.text();

  const csrfMatch = pageHtml.match(/"csrf":"([^"]+)"/);
  if (!csrfMatch) {
    throw new Error("apedalar: CSRF token not found");
  }

  const csrf = csrfMatch[1]!;

  const uriMatch = pageHtml.match(/"uri":"(https:[^"]+)"/);
  if (!uriMatch) {
    throw new Error("apedalar: Livewire URI not found");
  }

  const livewireUri = uriMatch[1]!.replace(/\\\//g, "/");

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

  if (!initialSnapshot) {
    throw new Error("apedalar: component snapshot not found");
  }

  const percursoNames = extractPercursoNames(initialSnapshot);
  const mediofondoPercurso = percursoNames[1] ?? "Mediofondo";

  const escalaoOptions = extractEscalaoOptions(pageHtml, initialSnapshot);
  const distances: StoredDistanceResults[] = [];

  if (escalaoOptions.length > 0) {
    // Two-phase approach: Phase 1 = base HTML (correct server pos), Phase 2 = per-escalao (category lookup).
    // IMPORTANT: Livewire ignores escalao when multiple properties are updated at once — single-property only.
    const gfFBase = await apedalarLivewireFetch(
      livewireUri,
      initialSnapshot,
      { sexo: "F" },
      cookieStr,
      csrf,
      config.resultsUrl,
    );
    const mfMBase = await apedalarLivewireFetch(
      livewireUri,
      initialSnapshot,
      { percurso: mediofondoPercurso },
      cookieStr,
      csrf,
      config.resultsUrl,
    );
    const mfFBase = await apedalarLivewireFetch(
      livewireUri,
      mfMBase.snapshot,
      { sexo: "F" },
      cookieStr,
      csrf,
      config.resultsUrl,
    );

    const distConfigs = [
      {
        distId: "1",
        distName: "Granfondo",
        mSnapshot: initialSnapshot,
        mBaseHtml: pageHtml,
        fBase: gfFBase,
      },
      {
        distId: "2",
        distName: "Mediofondo",
        mSnapshot: mfMBase.snapshot,
        mBaseHtml: mfMBase.html,
        fBase: mfFBase,
      },
    ] as const;

    for (const {
      distId,
      distName,
      mSnapshot,
      mBaseHtml,
      fBase,
    } of distConfigs) {
      const mBaseRows = parseApedalarRows(mBaseHtml, "M");
      const fBaseRows = parseApedalarRows(fBase.html, "F");

      const bibCategory = new Map<string, string>();
      for (const escalao of escalaoOptions) {
        try {
          const resp = await apedalarLivewireFetch(
            livewireUri,
            mSnapshot,
            { escalao },
            cookieStr,
            csrf,
            config.resultsUrl,
          );
          for (const r of parseApedalarRows(resp.html, "M")) {
            if (r.bib) {
              bibCategory.set(r.bib, escalao);
            }
          }
        } catch (err) {
          console.warn(
            `apedalar: failed to fetch ${distName}/${escalao}: ${err}`,
          );
        }
      }

      const fEscalaoOptions = extractEscalaoOptions(fBase.html, fBase.snapshot);
      for (const escalao of fEscalaoOptions) {
        try {
          const resp = await apedalarLivewireFetch(
            livewireUri,
            fBase.snapshot,
            { escalao },
            cookieStr,
            csrf,
            config.resultsUrl,
          );
          for (const r of parseApedalarRows(resp.html, "F")) {
            if (r.bib) {
              bibCategory.set(r.bib, escalao);
            }
          }
        } catch (err) {
          console.warn(
            `apedalar: failed to fetch ${distName}/${escalao}: ${err}`,
          );
        }
      }

      const allRows = [...mBaseRows, ...fBaseRows];
      for (const r of allRows) {
        r.category = bibCategory.get(r.bib) ?? "";
      }

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
    console.warn(
      "apedalar: no escalao options found, fetching without category data",
    );
    const gfMRows = parseApedalarRows(pageHtml, "M");
    const gfFResp = await apedalarLivewireFetch(
      livewireUri,
      initialSnapshot,
      { sexo: "F" },
      cookieStr,
      csrf,
      config.resultsUrl,
    );
    const mfMResp = await apedalarLivewireFetch(
      livewireUri,
      initialSnapshot,
      { percurso: mediofondoPercurso },
      cookieStr,
      csrf,
      config.resultsUrl,
    );
    const mfFResp = await apedalarLivewireFetch(
      livewireUri,
      mfMResp.snapshot,
      { sexo: "F" },
      cookieStr,
      csrf,
      config.resultsUrl,
    );

    const gfResults = combineAndRankByTime([
      ...gfMRows,
      ...parseApedalarRows(gfFResp.html, "F"),
    ]);
    const mfResults = combineAndRankByTime([
      ...parseApedalarRows(mfMResp.html, "M"),
      ...parseApedalarRows(mfFResp.html, "F"),
    ]);
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
  }

  return {
    eventId: config.eventId,
    eventName: config.eventName,
    eventDate: config.eventDate,
    eventYear: config.eventYear,
    scrapedAt: new Date().toISOString(),
    distances,
  };
}

export function scrapeApedalar5Quinas(): Promise<StoredEventResults> {
  return scrapeApedalarEvent({
    eventId: 90003,
    eventName: "Granfondo 5 Quinas Sabugal 2025",
    eventDate: "2025-06-01",
    eventYear: 2025,
    resultsUrl: "https://apedalar.pt/eventos/3818/resultados",
  });
}

export function scrapeApedalar5Quinas2026(): Promise<StoredEventResults> {
  return scrapeApedalarEvent({
    eventId: 90012,
    eventName: "Granfondo 5 Quinas Sabugal 2026",
    eventDate: "2026-07-05",
    eventYear: 2026,
    resultsUrl: "https://apedalar.pt/eventos/4197/resultados",
  });
}
