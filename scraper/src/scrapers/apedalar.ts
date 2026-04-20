import { BROWSER_UA, cleanTime, makeResult } from "./shared.js";
import { timeToSeconds } from "../normalize.js";
import type { StoredEventResults, StoredDistanceResults, StoredResult } from "@granfondo/database/types";

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
  const selectMatch = html.match(
    /<select[^>]+wire:model(?:\.\w+)?=['"]escalao['"][^>]*>([\s\S]*?)<\/select>/
  );
  if (selectMatch) {
    const opts = [...selectMatch[1]!.matchAll(/<option[^>]+value=['"]([^'"]+)['"]/g)]
      .map((m) => m[1]!.trim())
      .filter(Boolean);
    if (opts.length > 0) return opts;
  }
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

function parseApedalarRows(html: string, gender: "M" | "F"): ApedalarRow[] {
  const rows: ApedalarRow[] = [];
  const trMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g);
  for (const m of trMatches) {
    const row = m[1]!;
    if (!row.includes("<td")) continue;

    const posMatch = row.match(
      /hidden sm:table-cell py-3 text-center font-semibold"[^>]*>(\d+)</
    );
    if (!posMatch) continue;

    const monoValues = [
      ...row.matchAll(/hidden sm:table-cell px-4 py-3 font-mono"[^>]*>([^<]+)</g),
    ].map((x) => x[1]!.trim());

    const nameMatch = row.match(/hidden sm:table-cell px-4 py-3"[^>]*>([^<]+)</);
    const teamMatch = row.match(/hidden lg:table-cell px-4 py-3"[^>]*>([^<]+)</);

    if (!nameMatch) continue;

    rows.push({
      pos:      parseInt(posMatch[1]!, 10),
      bib:      monoValues[0] ?? "",
      name:     nameMatch[1]!.trim(),
      team:     teamMatch?.[1]?.trim() ?? "",
      time:     monoValues[1] ?? "",
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
    return a.pos - b.pos;
  });
  return rows.map((r, i) =>
    makeResult({
      pos:      i + 1,
      bib:      r.bib,
      name:     r.name,
      gender:   r.gender,
      team:     r.team,
      category: r.category,
      country:  "",
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
    components: [{
      snapshot,
      updates,
      calls: [{ method: "$commit", params: [], metadata: { type: "model.live" } }],
    }],
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
    components: Array<{ snapshot: string; effects?: { html?: string } }>;
  };
  const comp = data.components[0]!;
  return { snapshot: comp.snapshot, html: comp.effects?.html ?? "" };
}

export async function scrapeApedalar5Quinas(): Promise<StoredEventResults> {
  const pageRes = await fetch("https://apedalar.pt/eventos/3818/resultados", {
    headers: { "User-Agent": BROWSER_UA },
  });
  if (!pageRes.ok) throw new Error(`apedalar page HTTP ${pageRes.status}`);

  const rawSetCookie =
    typeof (pageRes.headers as any).getSetCookie === "function"
      ? ((pageRes.headers as any).getSetCookie() as string[])
      : [pageRes.headers.get("set-cookie") ?? ""];
  const cookieStr = rawSetCookie.filter(Boolean).map((h) => h.split(";")[0]!).join("; ");

  const pageHtml = await pageRes.text();

  const csrfMatch = pageHtml.match(/"csrf":"([^"]+)"/);
  if (!csrfMatch) throw new Error("apedalar: CSRF token not found");
  const csrf = csrfMatch[1]!;

  const uriMatch = pageHtml.match(/"uri":"(https:[^"]+)"/);
  if (!uriMatch) throw new Error("apedalar: Livewire URI not found");
  const livewireUri = uriMatch[1]!.replace(/\\\//g, "/");

  let initialSnapshot = "";
  for (const m of pageHtml.matchAll(/wire:snapshot="([^"]+)"/g)) {
    const decoded = htmlAttrDecode(m[1]!);
    try {
      const snap = JSON.parse(decoded) as { memo?: { name?: string } };
      if (snap.memo?.name === "frontend.tempos.tempos-table") { initialSnapshot = decoded; break; }
    } catch { continue; }
  }
  if (!initialSnapshot) throw new Error("apedalar: component snapshot not found");

  const escalaoOptions = extractEscalaoOptions(pageHtml, initialSnapshot);
  const distances: StoredDistanceResults[] = [];

  if (escalaoOptions.length > 0) {
    // Two-phase approach: Phase 1 = base HTML (correct server pos), Phase 2 = per-escalao (category lookup).
    // IMPORTANT: Livewire ignores escalao when multiple properties are updated at once — single-property only.
    const gfFBase = await apedalarLivewireFetch(livewireUri, initialSnapshot, { sexo: "F" }, cookieStr, csrf);
    const mfMBase = await apedalarLivewireFetch(livewireUri, initialSnapshot, { percurso: "Mediofondo 86km" }, cookieStr, csrf);
    const mfFBase = await apedalarLivewireFetch(livewireUri, mfMBase.snapshot, { sexo: "F" }, cookieStr, csrf);

    const distConfigs = [
      { distId: "1", distName: "Granfondo",   mSnapshot: initialSnapshot, mBaseHtml: pageHtml,     fBase: gfFBase },
      { distId: "2", distName: "Mediofondo",  mSnapshot: mfMBase.snapshot, mBaseHtml: mfMBase.html, fBase: mfFBase },
    ] as const;

    for (const { distId, distName, mSnapshot, mBaseHtml, fBase } of distConfigs) {
      const mBaseRows = parseApedalarRows(mBaseHtml, "M");
      const fBaseRows = parseApedalarRows(fBase.html, "F");

      const bibCategory = new Map<string, string>();
      for (const escalao of escalaoOptions) {
        try {
          const resp = await apedalarLivewireFetch(livewireUri, mSnapshot, { escalao }, cookieStr, csrf);
          for (const r of parseApedalarRows(resp.html, "M")) { if (r.bib) bibCategory.set(r.bib, escalao); }
        } catch (err) { console.warn(`apedalar: failed to fetch ${distName}/${escalao}: ${err}`); }
      }

      const fEscalaoOptions = extractEscalaoOptions(fBase.html, fBase.snapshot);
      for (const escalao of fEscalaoOptions) {
        try {
          const resp = await apedalarLivewireFetch(livewireUri, fBase.snapshot, { escalao }, cookieStr, csrf);
          for (const r of parseApedalarRows(resp.html, "F")) { if (r.bib) bibCategory.set(r.bib, escalao); }
        } catch (err) { console.warn(`apedalar: failed to fetch ${distName}/${escalao}: ${err}`); }
      }

      const allRows = [...mBaseRows, ...fBaseRows];
      for (const r of allRows) r.category = bibCategory.get(r.bib) ?? "";

      if (allRows.length > 0) {
        const results = combineAndRankByTime(allRows);
        distances.push({ id: distId, name: distName, finisherCount: results.length, results });
      }
    }
  } else {
    console.warn("apedalar: no escalao options found, fetching without category data");
    const gfMRows = parseApedalarRows(pageHtml, "M");
    const gfFResp = await apedalarLivewireFetch(livewireUri, initialSnapshot, { sexo: "F" }, cookieStr, csrf);
    const mfMResp = await apedalarLivewireFetch(livewireUri, initialSnapshot, { percurso: "Mediofondo 86km" }, cookieStr, csrf);
    const mfFResp = await apedalarLivewireFetch(livewireUri, mfMResp.snapshot, { sexo: "F" }, cookieStr, csrf);

    const gfResults = combineAndRankByTime([...gfMRows, ...parseApedalarRows(gfFResp.html, "F")]);
    const mfResults = combineAndRankByTime([...parseApedalarRows(mfMResp.html, "M"), ...parseApedalarRows(mfFResp.html, "F")]);
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
