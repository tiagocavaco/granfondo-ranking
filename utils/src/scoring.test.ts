import { describe, it, expect } from "vitest";
import {
  posToBasePoints,
  finisherCoefficient,
  rankToTeamBasePoints,
  teamCoefficient,
} from "@granfondo/utils/scoring";

// ── posToBasePoints ───────────────────────────────────────────────────────────

describe("posToBasePoints", () => {
  it("returns 75 for position 1", () => expect(posToBasePoints(1)).toBe(75));
  it("returns 65 for position 2", () => expect(posToBasePoints(2)).toBe(65));
  it("returns 60 for position 3", () => expect(posToBasePoints(3)).toBe(60));
  it("returns 55 for position 4", () => expect(posToBasePoints(4)).toBe(55));
  it("returns 50 for position 5", () => expect(posToBasePoints(5)).toBe(50));
  it("returns 45 for position 6", () => expect(posToBasePoints(6)).toBe(45));
  it("returns 40 for position 7", () => expect(posToBasePoints(7)).toBe(40));
  it("returns 35 for position 8", () => expect(posToBasePoints(8)).toBe(35));
  it("returns 30 for position 9", () => expect(posToBasePoints(9)).toBe(30));
  it("returns 25 for position 10", () => expect(posToBasePoints(10)).toBe(25));
  it("returns 7 for position 20", () => expect(posToBasePoints(20)).toBe(7));
  it("returns 5 for position 25", () => expect(posToBasePoints(25)).toBe(5));
  it("returns 1 for position 50", () => expect(posToBasePoints(50)).toBe(1));
  it("returns 0 for position 51", () => expect(posToBasePoints(51)).toBe(0));
  it("returns 0 for position 0", () => expect(posToBasePoints(0)).toBe(0));
});

// ── finisherCoefficient ───────────────────────────────────────────────────────

describe("finisherCoefficient", () => {
  it("returns 1.00 at reference (300 finishers)", () => {
    expect(finisherCoefficient(300)).toBe(1);
  });

  it("returns 0.50 for 75 finishers (quarter reference)", () => {
    expect(finisherCoefficient(75)).toBe(0.5);
  });

  it("returns > 1 for more than 300 finishers", () => {
    expect(finisherCoefficient(600)).toBeGreaterThan(1);
  });

  it("returns > 0 for 1 finisher", () => {
    expect(finisherCoefficient(1)).toBeGreaterThan(0);
  });

  it("rounds to 2 decimal places", () => {
    const c = finisherCoefficient(150);
    expect(c).toBe(Math.round(c * 100) / 100);
  });
});

// ── rankToTeamBasePoints ──────────────────────────────────────────────────────

describe("rankToTeamBasePoints", () => {
  it("returns 25 for rank 1", () => expect(rankToTeamBasePoints(1)).toBe(25));
  it("returns 20 for rank 2", () => expect(rankToTeamBasePoints(2)).toBe(20));
  it("returns 15 for rank 3", () => expect(rankToTeamBasePoints(3)).toBe(15));
  it("returns 1 for rank 10", () => expect(rankToTeamBasePoints(10)).toBe(1));
  it("returns 0 for rank 11", () => expect(rankToTeamBasePoints(11)).toBe(0));
});

// ── teamCoefficient ───────────────────────────────────────────────────────────

describe("teamCoefficient", () => {
  it("returns 1.00 at reference (25 teams)", () => {
    expect(teamCoefficient(25)).toBe(1);
  });

  it("returns < 1 for fewer than 25 teams", () => {
    expect(teamCoefficient(12)).toBeLessThan(1);
  });

  it("returns > 0 for 1 team", () => {
    expect(teamCoefficient(1)).toBeGreaterThan(0);
  });
});
