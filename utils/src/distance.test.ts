import { describe, it, expect } from "vitest";
import { predictionDistCoeff, predictionYearCoeff, distancePriority } from "./distance.js";

describe("predictionDistCoeff", () => {
  it("returns 1.0 for same distance", () => {
    expect(predictionDistCoeff("Granfondo", "Granfondo")).toBe(1.0);
    expect(predictionDistCoeff("Mediofondo", "Mediofondo")).toBe(1.0);
    expect(predictionDistCoeff("Minifondo", "Minifondo")).toBe(1.0);
  });

  it("gives a bonus when historical distance is longer than registered", () => {
    // Granfondo history (longest) → predicting Mediofondo performance
    expect(predictionDistCoeff("Mediofondo", "Granfondo")).toBeGreaterThan(1.0);
    // Granfondo history → predicting Minifondo performance (2 steps shorter)
    expect(predictionDistCoeff("Minifondo", "Granfondo")).toBeGreaterThan(
      predictionDistCoeff("Minifondo", "Mediofondo"),
    );
  });

  it("gives a penalty when historical distance is shorter than registered", () => {
    // Minifondo history → predicting Granfondo performance
    expect(predictionDistCoeff("Granfondo", "Minifondo")).toBeLessThan(1.0);
    expect(predictionDistCoeff("Granfondo", "Mediofondo")).toBeLessThan(1.0);
  });

  it("step size is 0.2 per distance rank", () => {
    // Mediofondo registered (rank 1), Granfondo historical (rank 0): 1.0 + (1-0)*0.2 = 1.2
    expect(predictionDistCoeff("Mediofondo", "Granfondo")).toBeCloseTo(1.2, 10);
    // Granfondo registered (rank 0), Mediofondo historical (rank 1): 1.0 + (0-1)*0.2 = 0.8
    expect(predictionDistCoeff("Granfondo", "Mediofondo")).toBeCloseTo(0.8, 10);
  });

  it("Time Trial only matches itself", () => {
    expect(predictionDistCoeff("Time Trial", "Time Trial")).toBe(1.0);
    expect(predictionDistCoeff("Time Trial", "Granfondo")).toBe(0);
    expect(predictionDistCoeff("Granfondo", "Time Trial")).toBe(0);
  });

  it("returns 0 for unknown cross-distance", () => {
    expect(predictionDistCoeff("Unknown", "Granfondo")).toBe(0);
    expect(predictionDistCoeff("Granfondo", "Unknown")).toBe(0);
  });

  it("returns 1.0 for identical unknown distances", () => {
    expect(predictionDistCoeff("Unknown", "Unknown")).toBe(1.0);
  });
});

describe("predictionYearCoeff", () => {
  it("returns 1.0 for the current year", () => {
    const year = 2026;
    expect(predictionYearCoeff(year, year)).toBe(1.0);
  });

  it("decays by 0.1 per year", () => {
    expect(predictionYearCoeff(2025, 2026)).toBeCloseTo(0.9, 10);
    expect(predictionYearCoeff(2024, 2026)).toBeCloseTo(0.8, 10);
    expect(predictionYearCoeff(2020, 2026)).toBeCloseTo(0.4, 10);
  });

  it("returns 0 for 10+ years ago", () => {
    expect(predictionYearCoeff(2016, 2026)).toBe(0);
    expect(predictionYearCoeff(2010, 2026)).toBe(0);
  });

  it("never returns a negative value", () => {
    expect(predictionYearCoeff(1990, 2026)).toBe(0);
  });
});

describe("distancePriority", () => {
  it("Granfondo sorts before Mediofondo before Minifondo before Time Trial", () => {
    expect(distancePriority("Granfondo")).toBeLessThan(distancePriority("Mediofondo"));
    expect(distancePriority("Mediofondo")).toBeLessThan(distancePriority("Minifondo"));
    expect(distancePriority("Minifondo")).toBeLessThan(distancePriority("Time Trial"));
  });

  it("returns 9 for unknown distances", () => {
    expect(distancePriority("Unknown")).toBe(9);
    expect(distancePriority("")).toBe(9);
  });
});
