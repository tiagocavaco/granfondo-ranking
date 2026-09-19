import { describe, it, expect, vi, afterEach } from "vitest";
import { formatAge, isEventPast } from "./date";

function isoAt(msAgo: number): string {
  return new Date(Date.now() - msAgo).toISOString();
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

afterEach(() => {
  vi.useRealTimers();
});

describe("isEventPast", () => {
  it("returns false for today's date with no results", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(isEventPast(today, false)).toBe(false);
  });

  it("returns true for today's date when results are available", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(isEventPast(today, true)).toBe(true);
  });

  it("returns true for a past date regardless of hasResults", () => {
    expect(isEventPast("2020-01-01", false)).toBe(true);
    expect(isEventPast("2020-01-01", true)).toBe(true);
  });

  it("returns false for a future date with no results", () => {
    expect(isEventPast("2099-12-31", false)).toBe(false);
  });

  it("returns true for a future date when results are already available", () => {
    expect(isEventPast("2099-12-31", true)).toBe(true);
  });
});

describe("formatAge", () => {
  it("returns 'less than an hour ago' for times under 60 minutes", () => {
    expect(formatAge(isoAt(30 * MINUTE))).toBe("less than an hour ago");
    expect(formatAge(isoAt(59 * MINUTE))).toBe("less than an hour ago");
    expect(formatAge(isoAt(MINUTE))).toBe("less than an hour ago");
  });

  it("returns hours ago for times between 1 and 24 hours", () => {
    expect(formatAge(isoAt(HOUR))).toBe("1h ago");
    expect(formatAge(isoAt(12 * HOUR))).toBe("12h ago");
    expect(formatAge(isoAt(23 * HOUR))).toBe("23h ago");
  });

  it("returns 'yesterday' for exactly one day ago", () => {
    expect(formatAge(isoAt(DAY))).toBe("yesterday");
  });

  it("returns days ago for times between 2 and 29 days", () => {
    expect(formatAge(isoAt(2 * DAY))).toBe("2 days ago");
    expect(formatAge(isoAt(15 * DAY))).toBe("15 days ago");
    expect(formatAge(isoAt(29 * DAY))).toBe("29 days ago");
  });

  it("returns '1 month ago' for 30 days", () => {
    expect(formatAge(isoAt(30 * DAY))).toBe("1 month ago");
  });

  it("returns plural months for 60+ days", () => {
    expect(formatAge(isoAt(60 * DAY))).toBe("2 months ago");
    expect(formatAge(isoAt(90 * DAY))).toBe("3 months ago");
  });
});
