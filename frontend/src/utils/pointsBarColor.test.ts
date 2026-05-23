import { describe, it, expect } from "vitest";
import { pointsBarColor } from "./pointsBarColor";

describe("pointsBarColor", () => {
  it("returns blue gradient when above 60%", () => {
    expect(pointsBarColor(70, 100)).toContain("blue-500");
  });

  it("returns violet gradient when between 30% and 60%", () => {
    expect(pointsBarColor(50, 100)).toContain("violet-400");
  });

  it("returns slate gradient when below 30%", () => {
    expect(pointsBarColor(20, 100)).toContain("slate-300");
  });

  it("handles exact 60% boundary as violet", () => {
    expect(pointsBarColor(60, 100)).toContain("violet-400");
  });

  it("handles exact 30% boundary as slate", () => {
    expect(pointsBarColor(30, 100)).toContain("slate-300");
  });

  it("works with fractional points", () => {
    expect(pointsBarColor(100, 100)).toContain("blue-500");
    expect(pointsBarColor(1, 100)).toContain("slate-300");
  });
});
