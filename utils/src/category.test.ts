import { describe, it, expect } from "vitest";
import { canonicalizeCategory, isFemaleCategory, categorySortKey } from "./category.js";

describe("canonicalizeCategory", () => {
  it("maps known Elite Male strings", () => {
    expect(canonicalizeCategory("ELITES M")).toBe("Elite Male");
    expect(canonicalizeCategory("M Elite")).toBe("Elite Male");
    expect(canonicalizeCategory("Sub 23 M")).toBe("Elite Male");
  });

  it("maps known Elite Female strings", () => {
    expect(canonicalizeCategory("ELITES F")).toBe("Elite Female");
    expect(canonicalizeCategory("F Elite")).toBe("Elite Female");
  });

  it("maps already-canonical strings to themselves", () => {
    expect(canonicalizeCategory("Elite Male")).toBe("Elite Male");
    expect(canonicalizeCategory("Masters A Male")).toBe("Masters A Male");
    expect(canonicalizeCategory("Masters C Female")).toBe("Masters C Female");
  });

  it("maps Masters variants from the explicit map", () => {
    expect(canonicalizeCategory("M Masters A")).toBe("Masters A Male");
    expect(canonicalizeCategory("F Masters A")).toBe("Masters A Female");
    expect(canonicalizeCategory("M Masters B")).toBe("Masters B Male");
  });

  it("maps Open 19-34 variants", () => {
    expect(canonicalizeCategory("M 19-34")).toBe("Open 19-34 Male");
    expect(canonicalizeCategory("F 19-34")).toBe("Open 19-34 Female");
  });

  it("maps E-Bike and Paracycling", () => {
    expect(canonicalizeCategory("E-Bike")).toBe("E-Bike");
    expect(canonicalizeCategory("Paracycling")).toBe("Paracycling");
  });

  it("falls back to normalizeCategory for patterns not in the explicit map", () => {
    // These match normalizeCategory regexes but aren't in the explicit map
    expect(canonicalizeCategory("masters a male")).toBe("Masters A Male");
    expect(canonicalizeCategory("mastera male")).toBe("Masters A Male");
  });

  it("returns Unknown for unrecognised input", () => {
    expect(canonicalizeCategory("zzz_unknown_xyz")).toBe("Unknown");
  });
});

describe("isFemaleCategory", () => {
  it("returns true for Female canonical categories", () => {
    expect(isFemaleCategory("Elite Female")).toBe(true);
    expect(isFemaleCategory("Masters A Female")).toBe(true);
    expect(isFemaleCategory("Open 19-34 Female")).toBe(true);
    expect(isFemaleCategory("ELITES F")).toBe(true);
    expect(isFemaleCategory("F Elite")).toBe(true);
  });

  it("returns false for Male canonical categories", () => {
    expect(isFemaleCategory("Elite Male")).toBe(false);
    expect(isFemaleCategory("Masters B Male")).toBe(false);
    expect(isFemaleCategory("ELITES M")).toBe(false);
  });

  it("returns false for gender-neutral categories", () => {
    expect(isFemaleCategory("E-Bike")).toBe(false);
    expect(isFemaleCategory("Paracycling")).toBe(false);
  });
});

describe("categorySortKey", () => {
  // Returns [groupIndex, subIndex] — compare as tuples
  function lt(a: [number, number], b: [number, number]): boolean {
    return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  }

  it("Elite sorts before Masters A", () => {
    expect(lt(categorySortKey("Elite Male"), categorySortKey("Masters A Male"))).toBe(true);
  });

  it("Masters A sorts before Masters B before Masters C", () => {
    expect(lt(categorySortKey("Masters A Male"), categorySortKey("Masters B Male"))).toBe(true);
    expect(lt(categorySortKey("Masters B Male"), categorySortKey("Masters C Male"))).toBe(true);
  });

  it("Masters D < Masters E < Masters F", () => {
    expect(lt(categorySortKey("Masters D Male"), categorySortKey("Masters E Male"))).toBe(true);
    expect(lt(categorySortKey("Masters E Male"), categorySortKey("Masters F Male"))).toBe(true);
  });

  it("E-Bike and Paracycling sort after Masters categories", () => {
    expect(lt(categorySortKey("Masters F Male"), categorySortKey("E-Bike"))).toBe(true);
    expect(lt(categorySortKey("E-Bike"), categorySortKey("Paracycling"))).toBe(true);
  });

  it("returns a tuple of two numbers", () => {
    const key = categorySortKey("Elite Male");
    expect(Array.isArray(key)).toBe(true);
    expect(typeof key[0]).toBe("number");
    expect(typeof key[1]).toBe("number");
  });

  it("unknown categories sort to the end", () => {
    const unknownKey = categorySortKey("zzz_unknown_xyz");
    expect(lt(categorySortKey("Paracycling"), unknownKey)).toBe(true);
  });
});
