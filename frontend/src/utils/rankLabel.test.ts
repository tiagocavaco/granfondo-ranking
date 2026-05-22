import { describe, it, expect } from "vitest";
import { rankLabel } from "./rankLabel";

describe("rankLabel", () => {
  it("returns gold medal for rank 1", () => {
    expect(rankLabel(1)).toBe("🥇");
  });

  it("returns silver medal for rank 2", () => {
    expect(rankLabel(2)).toBe("🥈");
  });

  it("returns bronze medal for rank 3", () => {
    expect(rankLabel(3)).toBe("🥉");
  });

  it("returns #N for any other rank", () => {
    expect(rankLabel(4)).toBe("#4");
    expect(rankLabel(10)).toBe("#10");
    expect(rankLabel(100)).toBe("#100");
  });
});
