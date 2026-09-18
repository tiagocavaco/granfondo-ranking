import { describe, it, expect } from "vitest";
import { distBadgeClass, distDotColor } from "./distance";

describe("distBadgeClass", () => {
  it("returns blue classes for Granfondo", () => {
    expect(distBadgeClass("Granfondo")).toContain("blue");
  });

  it("returns violet classes for Mediofondo", () => {
    expect(distBadgeClass("Mediofondo")).toContain("violet");
  });

  it("returns emerald classes for Minifondo", () => {
    expect(distBadgeClass("Minifondo")).toContain("emerald");
  });

  it("returns amber classes for Time Trial", () => {
    expect(distBadgeClass("Time Trial")).toContain("amber");
  });

  it("returns slate fallback for unknown distance", () => {
    const cls = distBadgeClass("Unknown");
    expect(cls).toContain("slate");
  });

  it("returns distinct classes for each known distance", () => {
    const classes = ["Granfondo", "Mediofondo", "Minifondo", "Time Trial"].map(
      distBadgeClass,
    );
    // Each distance gets a unique class string
    expect(new Set(classes).size).toBe(4);
  });
});

describe("distDotColor", () => {
  it("returns blue hex for Granfondo", () => {
    expect(distDotColor("Granfondo")).toBe("#3b82f6");
  });

  it("returns violet hex for Mediofondo", () => {
    expect(distDotColor("Mediofondo")).toBe("#8b5cf6");
  });

  it("returns emerald hex for Minifondo", () => {
    expect(distDotColor("Minifondo")).toBe("#10b981");
  });

  it("returns amber hex for Time Trial", () => {
    expect(distDotColor("Time Trial")).toBe("#f59e0b");
  });

  it("returns slate fallback hex for unknown distance", () => {
    expect(distDotColor("Unknown")).toBe("#64748b");
  });
});
