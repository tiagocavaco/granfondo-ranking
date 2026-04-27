import { normalizeName, teamNormalKey, SOLO_TEAM_KEYS } from "../normalize.js";

export function resolveParticipantAthleteIds(
  nameToId: Record<string, number>,
  allParticipants: Map<number, Array<{ name: string; team: string }>>,
): { ids: Map<string, number>; linked: number } {
  const nameToTeamMap = new Map<string, Array<[string, number]>>();
  for (const [key, id] of Object.entries(nameToId)) {
    const pipe = key.indexOf("|");
    if (pipe < 0) continue;
    const name = key.slice(0, pipe);
    const team = key.slice(pipe + 1);
    if (!nameToTeamMap.has(name)) nameToTeamMap.set(name, []);
    nameToTeamMap.get(name)!.push([team, id]);
  }

  const ids = new Map<string, number>();
  const compact = (s: string) => s.replace(/\s+/g, "");
  let linked = 0;

  for (const [eventId, participants] of allParticipants) {
    for (const p of participants) {
      const nameLower = normalizeName(p.name);
      const teamKey   = teamNormalKey(p.team);
      const soloKey   = !teamKey || SOLO_TEAM_KEYS.has(teamKey) ? "" : teamKey;
      const pKey      = `${eventId}:${p.name}:${p.team}`;

      if (`${nameLower}|${soloKey}` in nameToId) {
        ids.set(pKey, nameToId[`${nameLower}|${soloKey}`]!);
        linked++;
        continue;
      }

      if (soloKey === "") continue; // solo athletes without exact match — skip compact

      const compactKey = compact(teamKey);
      if (compactKey.length < 4) continue;
      const existing = nameToTeamMap.get(nameLower);
      if (!existing) continue;
      for (const [existingTeam, athleteId] of existing) {
        if (compact(existingTeam) === compactKey) {
          ids.set(pKey, athleteId);
          linked++;
          break;
        }
      }
    }
  }

  return { ids, linked };
}
