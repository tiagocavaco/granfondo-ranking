import { describe, it, expect, beforeAll } from "vitest";
import { getResults, getParticipants } from "./results.js";
import {
  setupTestDb,
  minimalData,
  mkEvent,
  mkStoredResult,
  mkParticipant,
} from "./test-db.js";

beforeAll(() => {
  setupTestDb(
    minimalData({
      events: [
        mkEvent(10, { name: "Granfondo Algarve", date: "2025-04-01", hasResults: true }),
        mkEvent(20, { name: "Upcoming Race", date: "2026-06-01", hasResults: false }),
      ],
      allResults: new Map([
        [
          10,
          {
            eventId: 10,
            eventName: "Granfondo Algarve",
            eventDate: "2025-04-01",
            eventYear: 2025,
            scrapedAt: "2025-04-02T10:00:00.000Z",
            distances: [
              {
                id: "1",
                name: "Granfondo",
                finisherCount: 3,
                results: [
                  mkStoredResult({ pos: 1, name: "João Silva", gender: "M", licences: ["LIC001", "LIC002"] }),
                  mkStoredResult({ pos: 2, name: "Pedro Alves", gender: "M" }),
                  mkStoredResult({ pos: 1, name: "Maria Costa", gender: "F", dnf: true }),
                ],
              },
              {
                id: "2",
                name: "Mediofondo",
                finisherCount: 1,
                results: [
                  mkStoredResult({ pos: 1, name: "Ana Ferreira", gender: "F" }),
                ],
              },
            ],
          },
        ],
      ]),
      allParticipants: new Map([
        [
          20,
          [
            mkParticipant({ bib: "10", name: "David Sousa", distance: "Granfondo" }),
            mkParticipant({ bib: "2", name: "Ana Silva", distance: "Mediofondo" }),
            mkParticipant({ bib: "", name: "Unknown Rider", distance: "Granfondo" }),
          ],
        ],
      ]),
    }),
  );
});

describe("getResults", () => {
  it("returns correct event metadata", async () => {
    const r = await getResults(10);
    expect(r.eventId).toBe(10);
    expect(r.eventName).toBe("Granfondo Algarve");
    expect(r.eventDate).toBe("2025-04-01");
    expect(r.eventYear).toBe(2025);
  });

  it("returns distances sorted by id numerically", async () => {
    const r = await getResults(10);
    expect(r.distances).toHaveLength(2);
    expect(r.distances[0]!.id).toBe("1");
    expect(r.distances[1]!.id).toBe("2");
  });

  it("returns finisherCount per distance", async () => {
    const r = await getResults(10);
    expect(r.distances[0]!.finisherCount).toBe(3);
    expect(r.distances[1]!.finisherCount).toBe(1);
  });

  it("orders results by pos with DNF sorted last", async () => {
    const r = await getResults(10);
    const dist = r.distances[0]!;
    expect(dist.results[0]!.name).toBe("João Silva");
    expect(dist.results[1]!.name).toBe("Pedro Alves");
    expect(dist.results[2]!.dnf).toBe(true);
  });

  it("joins multiple licences per result", async () => {
    const r = await getResults(10);
    const joao = r.distances[0]!.results.find((res) => res.name === "João Silva")!;
    expect(joao.licences).toHaveLength(2);
    expect(joao.licences).toContain("LIC001");
    expect(joao.licences).toContain("LIC002");
  });

  it("result with no licences has empty array", async () => {
    const r = await getResults(10);
    const pedro = r.distances[0]!.results.find((res) => res.name === "Pedro Alves")!;
    expect(pedro.licences).toEqual([]);
  });

  it("converts dnf to boolean", async () => {
    const r = await getResults(10);
    expect(r.distances[0]!.results[0]!.dnf).toBe(false);
    expect(r.distances[0]!.results[2]!.dnf).toBe(true);
  });

  it("converts dns to boolean", async () => {
    const r = await getResults(10);
    expect(r.distances[0]!.results[0]!.dns).toBe(false);
  });

  it("throws for unknown event id", async () => {
    await expect(getResults(999)).rejects.toThrow("999");
  });
});

describe("getParticipants", () => {
  it("returns participants sorted by bib numerically", async () => {
    const ps = await getParticipants(20);
    const withBib = ps.filter((p) => p.bib !== "");
    expect(withBib[0]!.bib).toBe("2");
    expect(withBib[1]!.bib).toBe("10");
  });

  it("puts empty-bib participants last", async () => {
    const ps = await getParticipants(20);
    expect(ps[ps.length - 1]!.bib).toBe("");
  });

  it("returns all participants for the event", async () => {
    const ps = await getParticipants(20);
    expect(ps).toHaveLength(3);
  });

  it("returns empty array for event with no participants", async () => {
    const ps = await getParticipants(10);
    expect(ps).toHaveLength(0);
  });

  it("does not expose id or eventId", async () => {
    const ps = await getParticipants(20);
    expect(ps[0]).not.toHaveProperty("id");
    expect(ps[0]).not.toHaveProperty("eventId");
  });
});
