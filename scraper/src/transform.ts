/**
 * transform.ts
 *
 * Raw StopAndGo API data → stored format transformations.
 * Pure functions: no side effects, no I/O.
 */

import { normalizeName, formatTime, timeToSeconds, normalizeCountry, fixRawTeamName } from "./normalize.js";
import type { ApiResult } from "./types.js";
import type {
  StoredParticipant,
  StoredDistance,
  StoredDistanceResults,
  StoredResult,
} from "@granfondo/database/types";

export function isGranfondoName(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("granfondo") || n.includes("grandfondo");
}

export function isKidsCamVariant(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("kids") || n.includes("caminhada") || n.includes(" vip") || n.includes("kids/cam");
}

export function extractDistances(athletes: StoredParticipant[]): StoredDistance[] {
  const seen = new Map<string, string>();
  for (const a of athletes) {
    if (a.distanceId && a.distance && !seen.has(a.distanceId)) {
      seen.set(a.distanceId, a.distance);
    }
  }
  return Array.from(seen.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => Number(a.id) - Number(b.id));
}

export function assignGenderPositions(distances: StoredDistanceResults[]): void {
  for (const dist of distances) {
    const byGender = new Map<string, typeof dist.results>();
    for (const r of dist.results) {
      if (r.dnf || r.dns || r.pos < 1) continue;
      if (!byGender.has(r.gender)) byGender.set(r.gender, []);
      byGender.get(r.gender)!.push(r);
    }
    for (const group of byGender.values()) {
      group.sort((a, b) => a.pos - b.pos);
      let rank = 0;
      let prevPos = -1;
      for (const r of group) {
        if (r.pos !== prevPos) { rank++; prevPos = r.pos; }
        r.genderPos = rank;
      }
    }
  }
}

export function assignCategoryPositions(distances: StoredDistanceResults[]): void {
  for (const dist of distances) {
    const byCategory = new Map<string, typeof dist.results>();
    for (const r of dist.results) {
      if (r.dnf || r.dns || r.pos < 1 || !r.category) continue;
      if (!byCategory.has(r.category)) byCategory.set(r.category, []);
      byCategory.get(r.category)!.push(r);
    }
    for (const group of byCategory.values()) {
      group.sort((a, b) => a.pos - b.pos);
      let rank = 0;
      let prevPos = -1;
      for (const r of group) {
        if (r.pos !== prevPos) { rank++; prevPos = r.pos; }
        r.catPos = rank;
      }
    }
  }
}

function normalizeLicence(lic: string): string {
  return lic
    .trim()
    .toUpperCase()
    .replace(/^UCI\s*(ID\s*)?[-:]?\s*/i, "")
    .replace(/^(PT|FCP)[-\s]?/i, "")
    .replace(/\s+/g, "")
    .replace(/^0+(?=\d{5,})/, "");
}

export function transformResult(r: ApiResult): StoredResult {
  const raceTimeSecs = parseFloat(r.temposeg) || 0;
  const gapSecs = timeToSeconds(r.diferenca);
  const obs = (r.obs ?? "").toUpperCase();
  const dnf = obs.includes("DNF") || obs.includes("ABANDONOU") || obs === "AB";
  const dns = obs.includes("DNS") || obs.includes("NÃO PARTIU");
  return {
    pos: parseInt(r.pos, 10) || 0,
    genderPos: 0,
    catPos: 0,
    athleteId: 0,
    bib: r.dorsal,
    name: r.nome,
    nameLower: normalizeName(r.nome),
    gender: r.sexo || "M",
    team: fixRawTeamName(r.equipa ?? ""),
    category: r.escalao ?? "",
    country: normalizeCountry(r.pais_iso2 || r.pais_nome),
    raceTime: formatTime(r.tempo),
    raceTimeSecs,
    gap: formatTime(r.diferenca),
    gapSecs,
    points: Number(r.pontos) || 0,
    licences: [r.licenca1, r.licenca2]
      .map((l) => (l ? normalizeLicence(l.trim()) : ""))
      .filter(Boolean),
    dnf,
    dns,
  };
}
