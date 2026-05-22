import { describe, it, expect } from "vitest";
import { resolveTeamKey } from "./lookups.js";

// ── resolveTeamKey ────────────────────────────────────────────────────────────

describe("resolveTeamKey", () => {
  it("normalises a team name when no aliases are loaded", () => {
    expect(resolveTeamKey("C.B. Almodôvar")).toBe("cb almodovar");
  });

  it("strips punctuation and lowercases", () => {
    expect(resolveTeamKey("Sport Lisboa e Benfica")).toBe(
      "sport lisboa e benfica",
    );
  });

  it("returns empty string for empty input", () => {
    expect(resolveTeamKey("")).toBe("");
  });
});
