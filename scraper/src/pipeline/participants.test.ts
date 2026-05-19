import { describe, it, expect } from "vitest";
import { resolveParticipantAthleteIds } from "./participants.js";

const EVENT_ID = 1;

function makeParticipants(
  entries: Array<{ name: string; team: string }>,
): Map<number, Array<{ name: string; team: string }>> {
  return new Map([[EVENT_ID, entries]]);
}

describe("resolveParticipantAthleteIds", () => {
  it("resolves exact name+team match via team ID", () => {
    // teamNormalKey("Sporting") = "sporting", ID 10
    const nameToId = { "joao silva|10": 42 };
    const teamIdStore = new Map([["sporting", 10]]);
    const { ids, linked } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "João Silva", team: "Sporting" }]),
      teamIdStore,
    );
    expect(linked).toBe(1);
    expect(ids.get(`${EVENT_ID}:João Silva:Sporting`)).toBe(42);
  });

  it("returns 0 linked when team ID is unknown", () => {
    // Two "João Silva" athletes — name is ambiguous, so pass 6 won't fire either
    const nameToId = { "joao silva|10": 42, "joao silva|20": 99 };
    const teamIdStore = new Map<string, number>(); // team not in store
    const { ids, linked } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "João Silva", team: "Sporting" }]),
      teamIdStore,
    );
    expect(linked).toBe(0);
    expect(ids.size).toBe(0);
  });

  it("resolves solo-team participant (Individual) using empty key suffix", () => {
    // Solo athlete stored with key "david vaz|" (no team ID).
    // Participant registers as "Individual" → isSoloTeam → looks up "david vaz|".
    const nameToId = { "david vaz|": 3359 };
    const { ids, linked } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "David Vaz", team: "Individual" }]),
      new Map(),
    );
    expect(linked).toBe(1);
    expect(ids.get(`${EVENT_ID}:David Vaz:Individual`)).toBe(3359);
  });

  it("resolves solo participant to unique team athlete (pass 2)", () => {
    // Participant registers as "Individual" but only one "David Vaz" exists in DB (on a team).
    // Pass 2 matches them unambiguously.
    const nameToId = { "david vaz|5": 100 };
    const { linked, passes } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "David Vaz", team: "Individual" }]),
      new Map([["sporting", 5]]),
    );
    expect(linked).toBe(1);
    expect(passes[1]).toBe(1);
  });

  it("does not pollute nameToId — only reads from it", () => {
    const nameToId = { "pedro gomes|5": 5 };
    const original = { ...nameToId };
    resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "Pedro Gomes", team: "Sporting" }]),
      new Map([["sporting", 5]]),
    );
    expect(nameToId).toEqual(original);
  });

  it("handles multiple events independently", () => {
    const nameToId = { "carlos mota|7": 7 };
    const teamIdStore = new Map([["benfica", 7]]);
    const allParticipants = new Map([
      [1, [{ name: "Carlos Mota", team: "Benfica" }]],
      [2, [{ name: "Carlos Mota", team: "Benfica" }]],
    ]);
    const { ids, linked } = resolveParticipantAthleteIds(nameToId, allParticipants, teamIdStore);
    expect(linked).toBe(2);
    expect(ids.get("1:Carlos Mota:Benfica")).toBe(7);
    expect(ids.get("2:Carlos Mota:Benfica")).toBe(7);
  });

  it("returns 0 linked for completely unknown athlete", () => {
    const { ids, linked } = resolveParticipantAthleteIds(
      {},
      makeParticipants([{ name: "Unknown Athlete", team: "Random Team" }]),
      new Map(),
    );
    expect(linked).toBe(0);
    expect(ids.size).toBe(0);
  });

  it("resolves via fuzzy team — space variant of alias (pass 3)", () => {
    // "penacova first bike reconco" compacts to "penacovafirstbikereconco",
    // identical to alias "penacova firstbike reconco" → teamKeySimilarity = 1.0
    const teamIdStore = new Map([["penacova ceg reconco", 1]]);
    const teamAliases = { "penacova firstbike reconco": "penacova ceg reconco" };
    const nameToId = { "nuno almeida|1": 28 };
    const { ids, linked, passes } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "Nuno Almeida", team: "PENACOVA | FIRST BIKE | RECONCO" }]),
      teamIdStore,
      teamAliases,
    );
    expect(linked).toBe(1);
    expect(passes[2]).toBe(1); // matched by pass 3
    expect(ids.get(`${EVENT_ID}:Nuno Almeida:PENACOVA | FIRST BIKE | RECONCO`)).toBe(28);
  });

  it("does not fuzzy-match when similarity is below threshold", () => {
    // "totally different club" should not fuzzy-match "sporting"
    // Two "João Silva" athletes — name is ambiguous so pass 6 won't fire either
    const teamIdStore = new Map([["sporting", 10], ["benfica", 20]]);
    const nameToId = { "joao silva|10": 42, "joao silva|20": 99 };
    const { linked } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "João Silva", team: "Totally Different Club" }]),
      teamIdStore,
    );
    expect(linked).toBe(0);
  });

  it("resolves via secondary team — athlete's primary key is a different team (pass 4)", () => {
    // Daniel Marques: primary key is team 11 (cacb), but also races for team 12
    // (cb almodovar). Participant registers under team 12 → should resolve via pass 4.
    const nameToId = { "daniel marques|11": 3439 };
    const teamIdStore = new Map([["cacb", 11], ["cb almodovar banco primus swick", 12]]);
    const teamAliases = { "casa benfica almodovar": "cb almodovar banco primus swick" };
    const athleteAllTeamIds = new Map([[3439, [11, 12]]]);
    const { ids, linked, passes } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "Daniel Marques", team: "CASA BENFICA ALMODÔVAR" }]),
      teamIdStore,
      teamAliases,
      athleteAllTeamIds,
    );
    expect(linked).toBe(1);
    expect(passes[3]).toBe(1); // matched by pass 4
    expect(ids.get(`${EVENT_ID}:Daniel Marques:CASA BENFICA ALMODÔVAR`)).toBe(3439);
  });

  it("pass 4 does not match when athlete does not have participant's team", () => {
    // Same setup but athlete does NOT have team 12 → should not match
    // Second "Daniel Marques" added so pass 6 (globally unique name) won't fire either
    const nameToId = { "daniel marques|11": 3439, "daniel marques|99": 9999 };
    const teamIdStore = new Map([["cacb", 11], ["cb almodovar banco primus swick", 12], ["other club", 99]]);
    const teamAliases = { "casa benfica almodovar": "cb almodovar banco primus swick" };
    const athleteAllTeamIds = new Map([[3439, [11]], [9999, [99]]]); // neither has team 12
    const { linked } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "Daniel Marques", team: "CASA BENFICA ALMODÔVAR" }]),
      teamIdStore,
      teamAliases,
      athleteAllTeamIds,
    );
    expect(linked).toBe(0);
  });

  it("pass 4 does not match when multiple same-name athletes have the same team", () => {
    // Two "Carlos Mota" athletes both associated with team 7 → ambiguous, skip
    const nameToId = { "carlos mota|5": 100, "carlos mota|8": 200 };
    const teamIdStore = new Map([["benfica", 7], ["sporting", 5], ["porto", 8]]);
    const athleteAllTeamIds = new Map([[100, [5, 7]], [200, [8, 7]]]);
    const { linked } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "Carlos Mota", team: "Benfica" }]),
      teamIdStore,
      {},
      athleteAllTeamIds,
    );
    expect(linked).toBe(0);
  });

  it("resolves long participant name to short athlete name (pass 5, Portuguese)", () => {
    // "Filipe Da Silva Oliveira" registered → athlete stored as "Filipe Oliveira"
    // (4-token → first+last = "filipe oliveira" match)
    const nameToId = { "filipe oliveira|12": 80 };
    const teamIdStore = new Map([["cb almodovar banco primus swick", 12]]);
    const teamAliases = { "casa benfica almodovar": "cb almodovar banco primus swick" };
    const { ids, linked, passes } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "Filipe Da Silva Oliveira", team: "CASA BENFICA ALMODÔVAR" }]),
      teamIdStore,
      teamAliases,
    );
    expect(linked).toBe(1);
    expect(passes[4]).toBe(1); // matched by pass 5
    expect(ids.get(`${EVENT_ID}:Filipe Da Silva Oliveira:CASA BENFICA ALMODÔVAR`)).toBe(80);
  });

  it("resolves short participant name to long athlete name (pass 5, reverse)", () => {
    // "Filipe Oliveira" registered → athlete stored as "Filipe Da Silva Oliveira"
    const nameToId = { "filipe da silva oliveira|12": 80 };
    const teamIdStore = new Map([["sporting", 12]]);
    const { ids, linked, passes } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "Filipe Oliveira", team: "Sporting" }]),
      teamIdStore,
    );
    expect(linked).toBe(1);
    expect(passes[4]).toBe(1);
    expect(ids.get(`${EVENT_ID}:Filipe Oliveira:Sporting`)).toBe(80);
  });

  it("resolves via Spanish first+second convention (pass 5)", () => {
    // "Luis Garcia Fernandez" (3 tokens) → athlete stored as "Luis Garcia" (first+second)
    const nameToId = { "luis garcia|5": 99 };
    const teamIdStore = new Map([["real", 5]]);
    const { ids, linked, passes } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "Luis Garcia Fernandez", team: "Real" }]),
      teamIdStore,
    );
    expect(linked).toBe(1);
    expect(passes[4]).toBe(1);
    expect(ids.get(`${EVENT_ID}:Luis Garcia Fernandez:Real`)).toBe(99);
  });

  it("pass 5 does not match when name variant is ambiguous (two athletes same short name, same team)", () => {
    // Two athletes "Maria Silva" and "Maria Costa Silva" both in team 5 — ambiguous
    const nameToId = { "maria silva|5": 10, "maria costa|5": 20 };
    const teamIdStore = new Map([["porto", 5]]);
    const { linked } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "Maria Costa Silva", team: "Porto" }]),
      teamIdStore,
    );
    // "maria costa silva" short form = "maria silva" → matches athlete 10
    // "maria costa silva" spanish short = "maria costa" → matches athlete 20
    // both match → ambiguous → 0
    expect(linked).toBe(0);
  });

  it("resolves solo participant when exactly one athlete has that name (pass 2)", () => {
    // Natalio Penas registers as Individual — only one athlete with that name in DB
    const nameToId = { "natalio penas|7": 501 };
    const teamIdStore = new Map([["cycling club", 7]]);
    const { ids, linked, passes } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "Natalio Penas", team: "Individual" }]),
      teamIdStore,
    );
    expect(linked).toBe(1);
    expect(passes[1]).toBe(1); // matched by pass 2
    expect(ids.get(`${EVENT_ID}:Natalio Penas:Individual`)).toBe(501);
  });

  it("pass 2 does not match solo participant when name is ambiguous (two athletes)", () => {
    // Two athletes named "João Silva" in different teams — ambiguous, do not match
    const nameToId = { "joao silva|5": 10, "joao silva|8": 20 };
    const teamIdStore = new Map([["sporting", 5], ["benfica", 8]]);
    const { linked } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "João Silva", team: "Individual" }]),
      teamIdStore,
    );
    expect(linked).toBe(0);
  });

  it("pass 2 does not match solo participant when category conflicts with the unique athlete", () => {
    // Only one "Natalio Penas" in DB (Masters B) but participant registers as Elite → conflict
    const nameToId = { "natalio penas|7": 501 };
    const teamIdStore = new Map([["cycling club", 7]]);
    const athleteCategories = new Map([[501, ["Masters B"]]]);
    const { linked } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "Natalio Penas", team: "Individual", category: "Elite" }]),
      teamIdStore,
      {},
      new Map(),
      athleteCategories,
    );
    expect(linked).toBe(0);
  });

  it("pass 2 resolves ambiguous solo participant using category tiebreaker", () => {
    // Two "João Silva" athletes — one Masters B, one Elite.
    // Participant registers as Individual, category "Masters B" → only athlete 10 matches.
    const nameToId = { "joao silva|5": 10, "joao silva|8": 20 };
    const teamIdStore = new Map([["sporting", 5], ["benfica", 8]]);
    const athleteCategories = new Map([
      [10, ["Masters B"]],   // Masters B tier
      [20, ["Elite"]],       // Elite tier — conflicts with Masters B
    ]);
    const { ids, linked, passes } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "João Silva", team: "Individual", category: "Masters B" }]),
      teamIdStore,
      {},
      new Map(),
      athleteCategories,
    );
    expect(linked).toBe(1);
    expect(passes[1]).toBe(1); // matched by pass 2
    expect(ids.get(`${EVENT_ID}:João Silva:Individual`)).toBe(10);
  });

  it("pass 6 does not match elite participant to athlete whose effective tier is masters_a (has open_1934 + masters_a)", () => {
    // Athlete has M19–34 (open_1934) + Masters A → effective tier = masters_a.
    // Participant registers as Elite → no match.
    const nameToId = { "daniel marques|11": 3435 };
    const teamIdStore = new Map([["cacb", 11]]);
    const athleteCategories = new Map([[3435, ["M19–34", "Masters A"]]]);
    const { linked } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "Daniel Marques", team: "GDBP", category: "M ELITES" }]),
      teamIdStore,
      {},
      new Map(),
      athleteCategories,
    );
    expect(linked).toBe(0);
  });

  it("pass 6 does not match elite participant to athlete with open_1934 + masters_a + elite (masters_a overrides elite)", () => {
    // Athlete has all three tiers; effective tier resolves to masters_a (most age-senior).
    // Participant is Elite → no match.
    const nameToId = { "daniel marques|11": 3435 };
    const teamIdStore = new Map([["cacb", 11]]);
    const athleteCategories = new Map([[3435, ["M19–34", "Elite", "Masters A"]]]);
    const { linked } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "Daniel Marques", team: "GDBP", category: "M ELITES" }]),
      teamIdStore,
      {},
      new Map(),
      athleteCategories,
    );
    expect(linked).toBe(0);
  });

  it("pass 6 matches elite participant to athlete with open_1934 + elite (no masters)", () => {
    // Athlete has M19–34 (open_1934) + Elite → effective tier = elite → matches.
    const nameToId = { "daniel marques|11": 3435 };
    const teamIdStore = new Map([["cacb", 11]]);
    const athleteCategories = new Map([[3435, ["M19–34", "Elite"]]]);
    const { linked, passes } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "Daniel Marques", team: "GDBP", category: "M ELITES" }]),
      teamIdStore,
      {},
      new Map(),
      athleteCategories,
    );
    expect(linked).toBe(1);
    expect(passes[5]).toBe(1);
  });

  it("pass 6 matches open_1934 participant to athlete with only open_1934 (effective tier = open_1934)", () => {
    // Athlete has only M19–34 → effective = open_1934. Participant is M19-34 → matches.
    const nameToId = { "daniel marques|11": 3435 };
    const teamIdStore = new Map([["cacb", 11]]);
    const athleteCategories = new Map([[3435, ["M19–34"]]]);
    const { linked, passes } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "Daniel Marques", team: "GDBP", category: "M 19-34" }]),
      teamIdStore,
      {},
      new Map(),
      athleteCategories,
    );
    expect(linked).toBe(1);
    expect(passes[5]).toBe(1);
  });

  it("pass 6 does not match open_1934 participant to athlete whose effective tier is elite", () => {
    // Athlete has only Elite → effective = elite. Participant is M19-34 (open_1934) → no match.
    const nameToId = { "daniel marques|11": 3435 };
    const teamIdStore = new Map([["cacb", 11]]);
    const athleteCategories = new Map([[3435, ["Elite"]]]);
    const { linked } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "Daniel Marques", team: "GDBP", category: "M 19-34" }]),
      teamIdStore,
      {},
      new Map(),
      athleteCategories,
    );
    expect(linked).toBe(0);
  });
});
