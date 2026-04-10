import type { StoredEvent, StoredEventResults, ApiAthlete, AggregateRanking, TeamRanking, AthleteEntry, AthleteDisambiguation } from "./types";

export function athleteSlug(nameLower: string): string {
  return nameLower.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Normalize a display name to the slug used for athlete profile URLs. */
export function nameToSlug(name: string): string {
  const lower = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")              // strip combining diacritics
    .replace(/[´`\u00b4\u02b9\u02bc\u2018\u2019''']/g, "") // strip apostrophe/accent chars
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return athleteSlug(lower);
}

/** Mirror of scraper's normalizeTeam — produces the canonical team key. */
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

// Loaded once from /data/team_aliases.json (written by the scraper).
// Falls back to empty — alias resolution degrades gracefully if not yet fetched.
let teamAliases: Record<string, string> = {};
export function loadTeamAliases(aliases: Record<string, string>) {
  teamAliases = aliases;
}

function teamNormKey(name: string): string {
  const key = normalizeTeam(name);
  return teamAliases[key] ?? key;
}

const SOLO_TEAM_KEYS = new Set(["individual", "independente", "no team", "sem equipa", ""]);

/**
 * Compute the composite athlete slug from participant name + team.
 * Mirrors scraper's athleteKey() logic so navigation goes directly to
 * the right profile without hitting a disambiguation page.
 */
export function participantAthleteSlug(name: string, team: string): string {
  const nameLower = nameToSlug(name).replace(/-/g, " ");
  const teamKey = teamNormKey(team ?? "");
  if (!teamKey || SOLO_TEAM_KEYS.has(teamKey)) {
    return nameToSlug(name);
  }
  return athleteSlug(`${nameLower}|${teamKey}`);
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

  getAthlete(slug: string): Promise<AthleteEntry | AthleteDisambiguation> {
    return getJson<AthleteEntry | { redirectTo: string } | AthleteDisambiguation>(
      `/athlete/${athleteSlug(slug)}.json`
    ).then((data) => {
      if ("redirectTo" in data) {
        return getJson<AthleteEntry>(`/athlete/${data.redirectTo}.json`);
      }
      return data;
    });
  },

  async initTeamAliases(): Promise<void> {
    try {
      const aliases = await getJson<Record<string, string>>("/team_aliases.json");
      loadTeamAliases(aliases);
    } catch {
      // non-fatal: alias resolution works without it, just won't resolve custom aliases
    }
  },
};
