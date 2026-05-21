/**
 * lookups.ts
 *
 * In-memory lookup caches and helpers for resolving athlete IDs by name/team.
 * Populated at startup via initLookups().
 */

import { normalizeTeam } from "@granfondo/database/normalize";
import * as schema from "@granfondo/database/schema";
import { getDb } from "../db/db-client";

// In-memory caches populated by initLookups()
let teamAliasesCache = new Map<string, string>();
let teamKeyToIdCache = new Map<string, number>();

function teamNormKey(name: string): string {
  const key = normalizeTeam(name);
  return teamAliasesCache.get(key) ?? key;
}

export function resolveTeamKey(name: string): string {
  return teamNormKey(name);
}

export function resolveTeamId(name: string): number | undefined {
  return teamKeyToIdCache.get(teamNormKey(name));
}

export async function initLookups(): Promise<{ teamsLoaded: boolean }> {
  try {
    const db = await getDb();

    try {
      const teamRows = db.select().from(schema.teams).all();
      const newAliasCache = new Map<string, string>();
      const newIdCache = new Map<string, number>();
      for (const t of teamRows) {
        newIdCache.set(t.canonicalKey, t.id);
        for (const alias of JSON.parse(t.aliasKeys) as string[]) {
          newAliasCache.set(alias, t.canonicalKey);
          newIdCache.set(alias, t.id);
        }
      }

      teamAliasesCache = newAliasCache;
      teamKeyToIdCache = newIdCache;
      return { teamsLoaded: true };
    } catch (err) {
      console.warn(
        "[api] teams table unavailable — team profile links will not work (re-scrape needed):",
        err,
      );
      return { teamsLoaded: false };
    }
  } catch (err) {
    console.warn(
      "[api] initLookups failed — athlete profile links will not work:",
      err,
    );
    throw err;
  }
}
