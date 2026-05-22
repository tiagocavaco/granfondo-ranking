import { describe, it, expect, beforeAll } from "vitest";
import { getEvents, getStats } from "./events.js";
import { setupTestDb, minimalData, mkEvent } from "./test-db.js";

beforeAll(() => {
  setupTestDb(
    minimalData({
      events: [
        mkEvent(1, { name: "Granfondo Algarve", date: "2025-04-01", hasResults: true }),
        mkEvent(2, { name: "Granfondo Porto", date: "2025-05-10", hasResults: false }),
      ],
      stats: { uniqueAthletes: 42, uniqueByYear: { "2025": 42 } },
    }),
  );
});

describe("getEvents", () => {
  it("returns all events sorted by date descending", async () => {
    const events = await getEvents();
    expect(events).toHaveLength(2);
    expect(events[0]!.name).toBe("Granfondo Porto");
    expect(events[1]!.name).toBe("Granfondo Algarve");
  });

  it("includes event metadata", async () => {
    const events = await getEvents();
    const e = events[1]!;
    expect(e.id).toBe(1);
    expect(e.hasResults).toBe(true);
    expect(e.location).toBe("Lisbon");
    expect(e.distances).toEqual([{ id: "1", name: "Granfondo" }]);
  });

  it("maps hasResults correctly for events without results", async () => {
    const events = await getEvents();
    expect(events[0]!.hasResults).toBe(false);
  });
});

describe("getStats", () => {
  it("returns unique athlete count from stats", async () => {
    const stats = await getStats();
    expect(stats.uniqueAthletes).toBe(42);
    expect(stats.uniqueByYear).toEqual({ "2025": 42 });
  });
});
