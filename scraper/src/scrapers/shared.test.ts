import { describe, it, expect } from "vitest";
import { msToHHMMSS, cleanTime, makeResult, toTitleCase } from "./shared.js";

// ── msToHHMMSS ────────────────────────────────────────────────────────────────

describe("msToHHMMSS", () => {
  it("converts exact hours", () => {
    expect(msToHHMMSS(3600_000)).toBe("01:00:00");
  });

  it("converts hours, minutes, seconds", () => {
    expect(msToHHMMSS(3 * 3600_000 + 29 * 60_000 + 24_000)).toBe("03:29:24");
  });

  it("pads single-digit values", () => {
    expect(msToHHMMSS(1 * 3600_000 + 5 * 60_000 + 9_000)).toBe("01:05:09");
  });

  it("handles zero", () => {
    expect(msToHHMMSS(0)).toBe("00:00:00");
  });

  it("rounds sub-second milliseconds", () => {
    expect(msToHHMMSS(1_999)).toBe("00:00:02"); // 1.999s → 2s
  });

  it("handles multi-hour times", () => {
    expect(msToHHMMSS(10 * 3600_000)).toBe("10:00:00");
  });
});

// ── cleanTime ─────────────────────────────────────────────────────────────────

describe("cleanTime", () => {
  it("strips milliseconds from standard format", () => {
    expect(cleanTime("03:25:10.000")).toBe("03:25:10");
  });

  it("strips milliseconds from non-zero ms", () => {
    expect(cleanTime("01:02:03.456")).toBe("01:02:03");
  });

  it("pads single-digit hour", () => {
    expect(cleanTime("3:29:24.000")).toBe("03:29:24");
  });

  it("leaves already-padded hour unchanged", () => {
    expect(cleanTime("03:29:24.000")).toBe("03:29:24");
  });

  it("handles no milliseconds present", () => {
    expect(cleanTime("03:25:10")).toBe("03:25:10");
  });

  it("trims surrounding whitespace", () => {
    expect(cleanTime("  03:25:10.000  ")).toBe("03:25:10");
  });
});

// ── toTitleCase ───────────────────────────────────────────────────────────────

describe("toTitleCase", () => {
  it("title-cases a normal name", () => {
    expect(toTitleCase("john doe")).toBe("John Doe");
  });

  it("lowercases an all-caps name", () => {
    expect(toTitleCase("DAVID SILVA")).toBe("David Silva");
  });

  it("handles mixed case input", () => {
    expect(toTitleCase("mARIA jOSÉ")).toBe("Maria José");
  });

  it("handles single word", () => {
    expect(toTitleCase("CARLOS")).toBe("Carlos");
  });

  it("handles empty string", () => {
    expect(toTitleCase("")).toBe("");
  });

  it("does not capitalise mid-word after accented vowel (regression: JoãO → João)", () => {
    expect(toTitleCase("JOÃO PEDRO")).toBe("João Pedro");
  });

  it("does not capitalise mid-word after é (regression: HéLder → Hélder)", () => {
    expect(toTitleCase("HÉLDER LOUREIRO")).toBe("Hélder Loureiro");
  });

  it("does not capitalise mid-word after í (regression: LuíS → Luís)", () => {
    expect(toTitleCase("LUÍS MIGUEL")).toBe("Luís Miguel");
  });

  it("capitalises after hyphens", () => {
    expect(toTitleCase("MARIE-CLAIRE")).toBe("Marie-Claire");
  });
});

// ── makeResult ────────────────────────────────────────────────────────────────

describe("makeResult", () => {
  const base = {
    pos: 3,
    bib: "42",
    name: "DAVID CARVALHO",
    gender: "M",
    team: "Team A",
    category: "ELITES M",
    country: "Portugal",
    raceTime: "03:25:10",
  };

  it("maps basic fields", () => {
    const r = makeResult(base);
    expect(r.pos).toBe(3);
    expect(r.bib).toBe("42");
    expect(r.name).toBe("DAVID CARVALHO");
    expect(r.gender).toBe("M");
    expect(r.team).toBe("Team A");
    expect(r.category).toBe("ELITES M");
    expect(r.country).toBe("PT");
    expect(r.raceTime).toBe("03:25:10");
  });

  it("computes raceTimeSecs from raceTime", () => {
    const r = makeResult({ ...base, raceTime: "01:00:00" });
    expect(r.raceTimeSecs).toBe(3600);
  });

  it("defaults dnf and dns to false", () => {
    const r = makeResult(base);
    expect(r.dnf).toBe(false);
    expect(r.dns).toBe(false);
  });

  it("accepts explicit dnf=true", () => {
    const r = makeResult({ ...base, dnf: true });
    expect(r.dnf).toBe(true);
    expect(r.dns).toBe(false);
  });

  it("accepts explicit dns=true", () => {
    const r = makeResult({ ...base, dns: true });
    expect(r.dns).toBe(true);
    expect(r.dnf).toBe(false);
  });

  it("sets genderPos to 0, athleteId to 0, gap to empty", () => {
    const r = makeResult(base);
    expect(r.genderPos).toBe(0);
    expect(r.athleteId).toBe(0);
    expect(r.gap).toBe("");
    expect(r.gapSecs).toBe(0);
    expect(r.licences).toEqual([]);
  });
});
