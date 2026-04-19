/**
 * Canonical normalization functions shared between scraper (key generation)
 * and frontend (key lookup). Both sides must produce identical output.
 */

export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[´`\u00b4\u02b9\u02bc\u2018\u2019''']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function fixRawTeamName(name: string): string {
  return name.replace(/([aeiouAEIOU])\^/g, (_, v: string) => {
    const map: Record<string, string> = {
      a: "â", e: "ê", i: "î", o: "ô", u: "û",
      A: "Â", E: "Ê", I: "Î", O: "Ô", U: "Û",
    };
    return map[v] ?? v + "^";
  });
}

export function normalizeTeam(name: string): string {
  let s = fixRawTeamName(name);
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

export const SOLO_TEAM_KEYS = new Set(["individual", "independente", "no team", "sem equipa", ""]);
