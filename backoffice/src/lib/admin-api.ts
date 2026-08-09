const BASE = "/api/admin";

async function request(
  method: string,
  path: string,
  body: unknown,
): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
}

export const adminApi = {
  addAlias: (params: {
    name: string;
    team: string;
    aliasName: string;
    aliasTeam: string;
    note?: string;
  }) => request("POST", "/aliases", params),

  removeAlias: (params: { name: string; team: string }) =>
    request("DELETE", "/aliases", params),

  addAssignment: (params: {
    eventId: number;
    bib: string;
    athleteId: number;
    note?: string;
  }) => request("POST", "/assignments", params),

  removeAssignment: (params: { eventId: number; bib: string }) =>
    request("DELETE", "/assignments", params),

  addBlock: (params: {
    eventId: number;
    bib: string;
    athleteId: number;
    note?: string;
  }) => request("POST", "/blocks", params),

  removeBlock: (params: { eventId: number; bib: string }) =>
    request("DELETE", "/blocks", params),

  addTeamAlias: (params: { from: string; to: string }) =>
    request("POST", "/team-aliases", params),

  removeTeamAlias: (params: { from: string }) =>
    request("DELETE", "/team-aliases", params),
};
