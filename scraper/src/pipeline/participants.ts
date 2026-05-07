import { normalizeName, teamNormalKey, isSoloTeam } from "../normalize.js";

export function resolveParticipantAthleteIds(
  nameToId: Record<string, number>,
  allParticipants: Map<number, Array<{ name: string; team: string }>>,
  teamIdStore: Map<string, number>,
): { ids: Map<string, number>; linked: number } {
  const ids = new Map<string, number>();
  let linked = 0;

  for (const [eventId, participants] of allParticipants) {
    for (const p of participants) {
      const nameLower = normalizeName(p.name);
      const pKey = `${eventId}:${p.name}:${p.team}`;

      const teamId = isSoloTeam(p.team) ? 0 : (teamIdStore.get(teamNormalKey(p.team)) ?? 0);
      const lookupKey = `${nameLower}|${teamId === 0 ? "" : teamId}`;

      if (lookupKey in nameToId) {
        ids.set(pKey, nameToId[lookupKey]!);
        linked++;
      }
    }
  }

  return { ids, linked };
}
