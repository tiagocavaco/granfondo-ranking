/**
 * lookups.ts
 *
 * In-memory lookup caches and helpers for resolving athlete IDs by name/team.
 * Populated at startup via initLookups().
 */

import { normalizeTeam, normalizeName, SOLO_TEAM_KEYS } from "@granfondo/database/normalize";
import * as schema from "@granfondo/database/schema";
import { getDb } from "../db/db-client";

// In-memory caches populated by initLookups()
let teamAliasesCache = new Map<string, string>();
let nameToIdCache = new Map<string, number>();

function teamNormKey(name: string): string {
  const key = normalizeTeam(name);
  return teamAliasesCache.get(key) ?? key;
}

export function resolveTeamKey(name: string): string {
  return teamNormKey(name);
}

export function athleteLookupKey(name: string, team: string): string {
  const nameLower = normalizeName(name);
  const tk = teamNormKey(team ?? "");
  return (!tk || SOLO_TEAM_KEYS.has(tk)) ? `${nameLower}|` : `${nameLower}|${tk}`;
}

export function lookupAthleteId(name: string, team: string): number | null {
  return nameToIdCache.get(athleteLookupKey(name, team)) ?? null;
}

export async function initLookups(): Promise<void> {
  try {
    const db = await getDb();

    const aliasRows = db.select().from(schema.teamAliases).all();
    teamAliasesCache = new Map(aliasRows.map((r) => [r.aliasKey, r.canonicalKey]));

    const lookupRows = db.select().from(schema.athleteLookup).all();
    nameToIdCache = new Map(lookupRows.map((r) => [r.key, r.athleteId]));
  } catch (err) {
    console.warn("[api] initLookups failed — athlete profile links will not work:", err);
    throw err;
  }
}
