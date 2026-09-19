import { describe, it, expect } from "vitest";
import {
  posStyle,
  rankTextColor,
  rankBorderAccent,
  rankRowBg,
  rankBadgeStyle,
} from "./posStyle";

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
    // Dark palette: translucent blue background + light blue text
    expect(style).toContain("blue-500");
    expect(style).toContain("blue-300");
  });

  it("returns blue style for position 10 boundary", () => {
    expect(posStyle(10)).toContain("blue-500");
  });

  it("returns muted style for positions beyond 10", () => {
    const style = posStyle(11);
    // Dark palette: near-white/transparent bg + slate text
    expect(style).toContain("slate-400");
  });

  it("returns muted style for position 100", () => {
    expect(posStyle(100)).toContain("slate-400");
  });
});

describe("rankTextColor", () => {
  it("returns amber for rank 1", () => {
    expect(rankTextColor(1)).toBe("text-amber-400");
  });

  it("returns slate-300 for rank 2", () => {
    expect(rankTextColor(2)).toBe("text-slate-300");
  });

  it("returns orange for rank 3", () => {
    expect(rankTextColor(3)).toBe("text-orange-400");
  });

  it("returns the provided fallback for rank 4+", () => {
    expect(rankTextColor(4)).toBe("text-slate-200");
    expect(rankTextColor(4, "text-white")).toBe("text-white");
  });
});

describe("rankBorderAccent", () => {
  it("returns amber border for rank 1", () => {
    expect(rankBorderAccent(1)).toContain("amber-400");
  });

  it("returns slate border for rank 2", () => {
    expect(rankBorderAccent(2)).toContain("slate-400");
  });

  it("returns orange border for rank 3", () => {
    expect(rankBorderAccent(3)).toContain("orange-400");
  });

  it("returns blue border for ranks 4–10", () => {
    expect(rankBorderAccent(5)).toContain("blue-500");
    expect(rankBorderAccent(10)).toContain("blue-500");
  });

  it("returns transparent border for ranks beyond 10", () => {
    expect(rankBorderAccent(11)).toContain("transparent");
    expect(rankBorderAccent(100)).toContain("transparent");
  });
});

describe("rankRowBg", () => {
  it("returns amber tint for rank 1", () => {
    expect(rankRowBg(1)).toContain("amber");
  });

  it("returns slate tint for rank 2", () => {
    expect(rankRowBg(2)).toContain("slate");
  });

  it("returns orange tint for rank 3", () => {
    expect(rankRowBg(3)).toContain("orange");
  });

  it("returns empty string for rank 4+", () => {
    expect(rankRowBg(4)).toBe("");
    expect(rankRowBg(100)).toBe("");
  });
});

describe("rankBadgeStyle", () => {
  it("returns amber badge for rank 1", () => {
    expect(rankBadgeStyle(1)).toContain("amber");
  });

  it("returns slate badge for rank 2", () => {
    expect(rankBadgeStyle(2)).toContain("slate-300");
  });

  it("returns orange badge for rank 3", () => {
    expect(rankBadgeStyle(3)).toContain("orange");
  });

  it("returns muted badge for rank 4+", () => {
    expect(rankBadgeStyle(4)).toContain("slate-500");
    expect(rankBadgeStyle(100)).toContain("slate-500");
  });
});
