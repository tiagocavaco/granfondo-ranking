import {
  isPortugueseNameAbbrev,
  isSpanishNameAbbrev,
  nameIsShortFormOf,
} from "../../../normalize.js";
import type { AthleteEntry } from "@granfondo/database/types";
import type { PipelineCtx } from "../types.js";
import {
  addResult,
  deriveCanonicalTeam,
  licencesConflict,
  mergeLicenceSets,
} from "../helpers.js";

// Merges full legal names into short names within the same team.
// e.g. "Elio Fernando Oliveira Silva" → "Elio Silva"
// Portuguese convention: first + last token. Spanish: first + second token.
export function mergeLegalNameVariants(ctx: PipelineCtx): void {
  const { index } = ctx;

  type MemberInfo = { key: string; entry: AthleteEntry; tokens: string[] };
  const byTeamId = new Map<string, MemberInfo[]>();

  for (const [key, entry] of index) {
    if (key.includes("|solo:")) {
      continue;
    }

    const teamIdStr = key.slice(key.lastIndexOf("|") + 1);
    if (teamIdStr === "0") {
      continue;
    }

    const tokens = entry.nameLower.split(" ").filter(Boolean);
    if (!byTeamId.has(teamIdStr)) {
      byTeamId.set(teamIdStr, []);
    }

    byTeamId.get(teamIdStr)!.push({ key, entry, tokens });
  }

  function findShortCandidates(
    long: MemberInfo,
    members: MemberInfo[],
  ): MemberInfo[] {
    const active = (m: MemberInfo) => m.key !== long.key && index.has(m.key);

    const lastTokenMatches = members.filter(
      (m) => active(m) && isPortugueseNameAbbrev(m.tokens, long.tokens),
    );
    const secondTokenMatches = members.filter(
      (m) => active(m) && isSpanishNameAbbrev(m.tokens, long.tokens),
    );

    // Spanish match takes priority; if both exist the result is ambiguous
    if (secondTokenMatches.length > 0 && lastTokenMatches.length > 0) {
      return [];
    }

    return secondTokenMatches.length > 0
      ? secondTokenMatches
      : lastTokenMatches;
  }

  let count = 0;
  for (const members of byTeamId.values()) {
    if (members.length < 2) {
      continue;
    }

    for (const long of [...members]) {
      if (!index.has(long.key) || long.tokens.length < 3) {
        continue;
      }

      const shortCandidates = findShortCandidates(long, members);
      if (shortCandidates.length !== 1) {
        continue;
      }

      const short = shortCandidates[0]!;
      const siblingsForShort = members.filter(
        (m) =>
          m.key !== short.key &&
          index.has(m.key) &&
          nameIsShortFormOf(short.tokens, m.tokens),
      );
      if (siblingsForShort.length !== 1) {
        continue;
      }

      if (licencesConflict(long.key, short.key, ctx.entryLicences)) {
        continue;
      }

      for (const result of long.entry.results) {
        addResult(short.entry, result, false);
      }

      mergeLicenceSets(short.key, long.key, ctx.entryLicences);
      ctx.deletedKeys.add(long.key);
      index.delete(long.key);
      deriveCanonicalTeam(short.entry);
      count++;
      console.log(
        `  [legal-name-variants] "${long.entry.nameLower}" → "${short.entry.nameLower}" (team ${short.key.slice(short.key.lastIndexOf("|") + 1)})`,
      );
    }
  }

  if (count > 0) {
    console.log(
      `  [legal-name-variants] ${count} full-name profile(s) merged into short-name entries`,
    );
  }
}

// Merges missing-space name variants within the same team.
// e.g. "PedroGalante" → "Pedro Galante"
// Guard: exactly one entry must be a single token to match the missing-space pattern.
export function mergeMissingSpaceVariants(ctx: PipelineCtx): void {
  const { index } = ctx;

  type MemberInfo = { key: string; entry: AthleteEntry; noSpace: string };
  const byTeamId = new Map<string, Map<string, MemberInfo[]>>();

  for (const [key, entry] of index) {
    if (key.includes("|solo:")) {
      continue;
    }

    const teamIdStr = key.slice(key.lastIndexOf("|") + 1);
    if (teamIdStr === "0") {
      continue;
    }

    const noSpace = entry.nameLower.replace(/\s+/g, "");
    if (!byTeamId.has(teamIdStr)) {
      byTeamId.set(teamIdStr, new Map());
    }

    const teamMap = byTeamId.get(teamIdStr)!;
    if (!teamMap.has(noSpace)) {
      teamMap.set(noSpace, []);
    }

    teamMap.get(noSpace)!.push({ key, entry, noSpace });
  }

  let count = 0;
  for (const teamMap of byTeamId.values()) {
    for (const members of teamMap.values()) {
      if (members.length < 2) {
        continue;
      }

      if (members.length > 2) {
        console.warn(
          `  [missing-space] ${members.length}-way no-space collision on "${members[0]!.noSpace}" — skipped`,
        );
        continue;
      }

      const [a, b] = members as [MemberInfo, MemberInfo];

      if (!index.has(a.key) || !index.has(b.key)) {
        continue;
      }

      const aHasSpace = a.entry.nameLower.includes(" ");
      const bHasSpace = b.entry.nameLower.includes(" ");
      if (aHasSpace === bHasSpace) {
        continue;
      }

      if (licencesConflict(a.key, b.key, ctx.entryLicences)) {
        continue;
      }

      const [surviving, absorbed] =
        a.entry.results.length >= b.entry.results.length ? [a, b] : [b, a];

      for (const result of absorbed.entry.results) {
        addResult(surviving.entry, result, false);
      }

      mergeLicenceSets(surviving.key, absorbed.key, ctx.entryLicences);
      ctx.deletedKeys.add(absorbed.key);
      index.delete(absorbed.key);
      deriveCanonicalTeam(surviving.entry);
      count++;
      console.log(
        `  [missing-space] "${absorbed.entry.nameLower}" → "${surviving.entry.nameLower}" (team ${surviving.key.slice(surviving.key.lastIndexOf("|") + 1)})`,
      );
    }
  }

  if (count > 0) {
    console.log(`  [missing-space] ${count} missing-space name pair(s) merged`);
  }
}
