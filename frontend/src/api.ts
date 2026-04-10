import type { StoredEvent, StoredEventResults, ApiAthlete, AggregateRanking, TeamRanking, AthleteEntry } from "./types";

/** Strip accents and lowercase — matches scraper's normalizeName(). */
function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[´`\u00b4\u02b9\u02bc\u2018\u2019''']/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Mirrors scraper's normalizeTeam() — canonical key for a raw team name. */
function normalizeTeam(name: string): string {
  // Fix caret-as-circumflex encoding artifact
  let s = name.replace(/([aeiouAEIOU])\^/g, (_, v: string) => {
    const map: Record<string, string> = { a:"â",e:"ê",i:"î",o:"ô",u:"û",A:"Â",E:"Ê",I:"Î",O:"Ô",U:"Û" };
    return map[v] ?? v + "^";
  });
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  s = s.replace(/['''`´\u2018\u2019\u02bc]/g, "");
  s = s.replace(/#/g, "");
  s = s.replace(/[.,]/g, " ");
  s = s.replace(/[/|\\^&+@]/g, " ").replace(/\s*-\s*/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 6; i++) s = s.replace(/(?<![a-z])([a-z]) ([a-z])(?![a-z])/g, "$1$2");
  s = s.replace(/(?<![a-z])([a-z]{1,3}) ([a-z])(?![a-z])/g, "$1$2");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

const SOLO_TEAM_KEYS = new Set(["individual", "independente", "no team", "sem equipa", ""]);

// Loaded once at startup from /data/team_aliases.json and /data/name-to-id.json.
let teamAliases: Record<string, string> = {};
let nameToId: Record<string, number> = {};

function teamNormKey(name: string): string {
  const key = normalizeTeam(name);
  return teamAliases[key] ?? key;
}

/**
 * Compute the athlete lookup key: mirrors scraper's athleteKey().
 * `nameLower|teamKey` for affiliated athletes, `nameLower|` for solo/individual.
 */
function athleteLookupKey(name: string, team: string): string {
  const nameLower = normalizeName(name);
  const tk = teamNormKey(team ?? "");
  return (!tk || SOLO_TEAM_KEYS.has(tk)) ? `${nameLower}|` : `${nameLower}|${tk}`;
}

const BASE = `${import.meta.env.BASE_URL}data`;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`Not found: ${path}`);
  return res.json() as Promise<T>;
}

export const api = {
  getEvents(): Promise<StoredEvent[]> {
    return getJson<StoredEvent[]>("/events.json");
  },

  getParticipants(id: number): Promise<ApiAthlete[]> {
    return getJson<ApiAthlete[]>(`/${id}_participants.json`);
  },

  getResults(id: number): Promise<StoredEventResults> {
    return getJson<StoredEventResults>(`/${id}_results.json`);
  },

  getAggregateRanking(): Promise<AggregateRanking> {
    return getJson<AggregateRanking>("/aggregate_ranking.json");
  },

  getTeamRanking(): Promise<TeamRanking> {
    return getJson<TeamRanking>("/team_ranking.json");
  },

  getStats(): Promise<{ uniqueAthletes: number; uniqueByYear: Record<string, number> }> {
    return getJson<{ uniqueAthletes: number; uniqueByYear: Record<string, number> }>("/stats.json");
  },

  getAthlete(id: number): Promise<AthleteEntry> {
    return getJson<AthleteEntry>(`/athlete/${id}.json`);
  },

  /** Look up athlete ID from display name + team. Returns null if not found. */
  lookupAthleteId(name: string, team: string): number | null {
    return nameToId[athleteLookupKey(name, team)] ?? null;
  },

  async initLookups(): Promise<void> {
    try {
      [teamAliases, nameToId] = await Promise.all([
        getJson<Record<string, string>>("/team_aliases.json"),
        getJson<Record<string, number>>("/name-to-id.json"),
      ]);
    } catch {
      // non-fatal: athlete navigation degrades gracefully
    }
  },
};
