import { normalizeName, teamNormalKey, isSoloTeam, teamKeySimilarity, categoryTier, athleteEffectiveTier } from "../normalize.js";

export function resolveParticipantAthleteIds(
  nameToId: Record<string, number>,
  allParticipants: Map<number, Array<{ name: string; team: string; category?: string }>>,
  teamIdStore: Map<string, number>,
  teamAliases: Record<string, string> = {},
  /** athleteId → all team IDs (primary + secondary) from athlete_teams */
  athleteAllTeamIds: Map<number, number[]> = new Map(),
  /** athleteId → all known categories across years (for category-based disambiguation) */
  athleteCategories: Map<number, string[]> = new Map(),
): { ids: Map<string, number>; linked: number; passes: [number, number, number, number, number, number] } {
  const ids = new Map<string, number>();
  let linked = 0;
  const passes: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];

  // Combine canonical and alias keys: knownKey → teamId (for pass-2/3/4 reverse lookup)
  const allTeamKeys = new Map<string, number>(teamIdStore);
  for (const [aliasKey, canonKey] of Object.entries(teamAliases)) {
    const id = teamIdStore.get(canonKey);
    if (id != null && !allTeamKeys.has(aliasKey)) allTeamKeys.set(aliasKey, id);
  }

  // Reverse map: teamId → all known keys (canonical + aliases)
  const teamIdToKeys = new Map<number, string[]>();
  for (const [k, id] of allTeamKeys) {
    if (!teamIdToKeys.has(id)) teamIdToKeys.set(id, []);
    teamIdToKeys.get(id)!.push(k);
  }

  // Name lookup: nameLower → [{ teamId, athleteId }] — mirrors pipeline's buildNameLookup
  const nameLookup = new Map<string, Array<{ teamId: number; athleteId: number }>>();
  // Short-name lookup: abbreviated "first last" → athletes whose stored name is longer.
  // Used in pass 4 for athlete-long / participant-short cases.
  const shortNameLookup = new Map<string, Array<{ teamId: number; athleteId: number }>>();

  for (const [key, athleteId] of Object.entries(nameToId)) {
    const pipeIdx = key.lastIndexOf("|");
    const namePart = key.slice(0, pipeIdx);
    const teamPart = key.slice(pipeIdx + 1);
    const teamId = Number(teamPart) || 0;
    if (!nameLookup.has(namePart)) nameLookup.set(namePart, []);
    nameLookup.get(namePart)!.push({ teamId, athleteId });

    // Index long-name athletes under their abbreviated form(s) for pass 4
    const tokens = namePart.split(" ").filter(Boolean);
    if (tokens.length >= 3) {
      const shortKey = `${tokens[0]} ${tokens[tokens.length - 1]}`;
      if (!shortNameLookup.has(shortKey)) shortNameLookup.set(shortKey, []);
      shortNameLookup.get(shortKey)!.push({ teamId, athleteId });
      // Spanish convention: first + second token (3-token names only)
      if (tokens.length === 3) {
        const spanishKey = `${tokens[0]} ${tokens[1]}`;
        if (!shortNameLookup.has(spanishKey)) shortNameLookup.set(spanishKey, []);
        shortNameLookup.get(spanishKey)!.push({ teamId, athleteId });
      }
    }
  }

  /** True if candidate's team matches the participant's team via any strategy. */
  function teamMatches(cTeamId: number, athleteId: number, pTeamId: number, pTeamKey: string): boolean {
    if (pTeamId > 0) {
      const allTeams = athleteAllTeamIds.get(athleteId) ?? (cTeamId > 0 ? [cTeamId] : []);
      if (allTeams.includes(pTeamId)) return true;
      const knownKeys = allTeams.flatMap((tid) => teamIdToKeys.get(tid) ?? []);
      return knownKeys.some((k) => teamKeySimilarity(pTeamKey, k) >= 0.9);
    } else {
      if (cTeamId === 0) return false;
      const knownKeys = teamIdToKeys.get(cTeamId) ?? [];
      return knownKeys.some((k) => teamKeySimilarity(pTeamKey, k) >= 0.9);
    }
  }

  for (const [eventId, participants] of allParticipants) {
    for (const p of participants) {
      const nameLower = normalizeName(p.name);
      const pKey = `${eventId}:${p.name}:${p.team}`;
      const solo = isSoloTeam(p.team);

      // Pass 1: exact name + resolved team ID.
      // Use allTeamKeys (canonical + aliases from teamAliases param) so this works
      // even when the global TEAM_ALIASES module state is not initialised (e.g. tests).
      const teamKey = solo ? "" : teamNormalKey(p.team);
      const teamId = solo ? 0 : (allTeamKeys.get(teamKey) ?? 0);
      const exactKey = `${nameLower}|${teamId === 0 ? "" : teamId}`;
      if (exactKey in nameToId) {
        ids.set(pKey, nameToId[exactKey]!);
        linked++; passes[0]++;
        continue;
      }

      // Pass 2: solo participant + unique name across all teams.
      // If a solo/Individual registrant has exactly one athlete with their
      // normalized name in the DB (across all teams), match them unambiguously.
      // When there are multiple same-name athletes, use the participant's category
      // as a tiebreaker: keep only those whose known categories are compatible.
      if (solo) {
        const allCandidates = nameLookup.get(nameLower) ?? [];
        let uniqueIds = new Set(allCandidates.map((c) => c.athleteId));
        if (p.category) {
          const pTier = categoryTier(p.category);
          if (pTier !== "unknown") {
            uniqueIds = new Set(
              [...uniqueIds].filter((id) => {
                const knownCats = athleteCategories.get(id) ?? [];
                if (knownCats.length === 0) return true;
                const effTier = athleteEffectiveTier(knownCats);
                return effTier === "unknown" || effTier === pTier;
              })
            );
          }
        }
        if (uniqueIds.size === 1) {
          ids.set(pKey, [...uniqueIds][0]!);
          linked++; passes[1]++;
        }
        continue;
      }

      // Passes 3–5 share a candidate set (same-name athletes)
      const exactCandidates = nameLookup.get(nameLower) ?? [];

      // Pass 3: name-first fuzzy team — unresolved team (teamId === 0).
      // Check whether any of the candidate athlete's known team keys fuzzy-matches
      // the participant's team key. Name-first avoids false positives.
      if (teamId === 0) {
        const matchedIds = new Set<number>();
        for (const { teamId: cTeamId, athleteId } of exactCandidates) {
          if (cTeamId === 0) continue;
          const knownKeys = teamIdToKeys.get(cTeamId) ?? [];
          if (knownKeys.some((k) => teamKeySimilarity(teamKey, k) >= 0.9)) {
            matchedIds.add(athleteId);
          }
        }
        if (matchedIds.size === 1) {
          ids.set(pKey, [...matchedIds][0]!);
          linked++; passes[2]++;
          continue;
        }
      }

      // Pass 4: team resolved (teamId > 0) but not the athlete's primary key team.
      // Check whether the participant's team is among any of the same-name athlete's
      // known secondary teams (or fuzzy-matches one of them).
      if (teamId > 0) {
        const matchedIds = new Set<number>();
        for (const { teamId: cTeamId, athleteId } of exactCandidates) {
          if (teamMatches(cTeamId, athleteId, teamId, teamKey)) matchedIds.add(athleteId);
        }
        if (matchedIds.size === 1) {
          ids.set(pKey, [...matchedIds][0]!);
          linked++; passes[3]++;
          continue;
        }
      }

      // Pass 5: name-variant matching (short ↔ long name) with any team strategy.
      // Mirrors pipeline pass 3b — Portuguese convention (first+last) and Spanish
      // convention (first+second for 3-token names).
      {
        const pTokens = nameLower.split(" ").filter(Boolean);
        const matchedIds = new Set<number>();

        const tryVariantCandidates = (cands: Array<{ teamId: number; athleteId: number }>) => {
          for (const { teamId: cTeamId, athleteId } of cands) {
            if (teamMatches(cTeamId, athleteId, teamId, teamKey)) matchedIds.add(athleteId);
          }
        };

        // Participant long name → athlete stored as short name (first+last)
        if (pTokens.length >= 3) {
          tryVariantCandidates(nameLookup.get(`${pTokens[0]} ${pTokens[pTokens.length - 1]}`) ?? []);
          // Spanish: participant has exactly 3 tokens, try first+second as athlete key
          if (pTokens.length === 3) {
            tryVariantCandidates(nameLookup.get(`${pTokens[0]} ${pTokens[1]}`) ?? []);
          }
        }

        // Participant short name → athlete stored as long name (indexed by first+last abbrev)
        tryVariantCandidates(shortNameLookup.get(nameLower) ?? []);

        if (matchedIds.size === 1) {
          ids.set(pKey, [...matchedIds][0]!);
          linked++; passes[4]++;
          continue;
        }
      }

      // Pass 6: globally unique name — exactly one athlete in the entire DB shares this
      // normalized name across all teams. Team mismatch is accepted (athlete may be
      // switching teams or the participant team string has no alias yet).
      // Stricter category filter than pass 2: open_1934 is inconclusive here; the
      // athlete must have the same specific tier in their history to be kept.
      // Only for non-solo participants (solo already covered by pass 2).
      // Debug log every match for manual review.
      if (!solo) {
        const allCandidates = nameLookup.get(nameLower) ?? [];
        let uniqueIds = new Set(allCandidates.map((c) => c.athleteId));
        if (p.category) {
          const pTier = categoryTier(p.category);
          if (pTier !== "unknown") {
            uniqueIds = new Set(
              [...uniqueIds].filter((id) => {
                const knownCats = athleteCategories.get(id) ?? [];
                if (knownCats.length === 0) return true;
                const effTier = athleteEffectiveTier(knownCats);
                // Pass 6 needs positive confirmation: unknown effective tier means
                // we can't confirm the match, so exclude.
                return effTier !== "unknown" && effTier === pTier;
              })
            );
          }
        }
        if (uniqueIds.size === 1) {
          const matchedId = [...uniqueIds][0]!;
          console.log(`  [p6] ev=${eventId} "${p.name}" (${p.team}) → athlete ${matchedId}`);
          ids.set(pKey, matchedId);
          linked++; passes[5]++;
          continue;
        }
      }
    }
  }

  return { ids, linked, passes };
}
