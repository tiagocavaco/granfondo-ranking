import { describe, it, expect } from "vitest";
import { posStyle } from "./posStyle";

describe("posStyle", () => {
  it("returns gold gradient for position 1", () => {
    expect(posStyle(1)).toContain("yellow-400");
  });

  it("returns silver gradient for position 2", () => {
    expect(posStyle(2)).toContain("slate-300");
  });

  it("returns bronze gradient for position 3", () => {
    expect(posStyle(3)).toContain("orange-400");
  });

  it("returns blue style for positions 4-10", () => {
    const style = posStyle(5);
    expect(style).toContain("blue-50");
    expect(style).toContain("blue-700");
  });

  it("returns grey style for positions beyond 10", () => {
    const style = posStyle(11);
    expect(style).toContain("slate-100");
    expect(style).toContain("slate-500");
  });

  it("returns grey style for position 10 boundary", () => {
    expect(posStyle(10)).toContain("blue-50");
  });

  it("returns grey style for position 100", () => {
    expect(posStyle(100)).toContain("slate-100");
  });
});
