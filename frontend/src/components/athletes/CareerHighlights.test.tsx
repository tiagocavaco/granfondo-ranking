import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CareerHighlights from "./CareerHighlights";
import type { AthleteResultRef } from "@granfondo/database/types";

function makeResult(
  overrides: Partial<AthleteResultRef> = {},
): AthleteResultRef {
  return {
    eventId: 1,
    eventName: "Test Event",
    eventDate: "2024-01-01",
    eventYear: 2024,
    distance: "Granfondo",
    pos: 5,
    genderPos: 3,
    catPos: 2,
    time: "3:00:00",
    gap: "+0:05:00",
    bib: "101",
    dnf: false,
    dns: false,
    ...overrides,
  };
}

describe("CareerHighlights — buildBestByDist logic", () => {
  it("returns null when results array is empty", () => {
    const { container } = render(<CareerHighlights results={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when all results are DNF or DNS", () => {
    const { container } = render(
      <CareerHighlights
        results={[
          makeResult({ dnf: true }),
          makeResult({ dns: true }),
          makeResult({ pos: 0 }),
        ]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows the best position per distance", () => {
    render(
      <CareerHighlights
        results={[
          makeResult({ distance: "Granfondo", pos: 10 }),
          makeResult({ distance: "Granfondo", pos: 3 }),
          makeResult({ distance: "Granfondo", pos: 7 }),
        ]}
      />,
    );
    // Best is pos 3 — shown as #3
    expect(screen.getByText("#3")).toBeTruthy();
    // Worse positions not shown
    expect(screen.queryByText("#10")).toBeNull();
  });

  it("shows one entry per distance when multiple distances are present", () => {
    render(
      <CareerHighlights
        results={[
          makeResult({ distance: "Granfondo", pos: 5 }),
          makeResult({ distance: "Mediofondo", pos: 2 }),
        ]}
      />,
    );
    expect(screen.getByText("#5")).toBeTruthy();
    expect(screen.getByText("#2")).toBeTruthy();
    expect(screen.getByText("Granfondo")).toBeTruthy();
    expect(screen.getByText("Mediofondo")).toBeTruthy();
  });

  it("excludes DNF results from best-position calculation", () => {
    render(
      <CareerHighlights
        results={[
          makeResult({ distance: "Granfondo", pos: 1, dnf: true }),
          makeResult({ distance: "Granfondo", pos: 8, dnf: false }),
        ]}
      />,
    );
    // pos 1 is DNF so best valid is pos 8
    expect(screen.getByText("#8")).toBeTruthy();
    expect(screen.queryByText("#1")).toBeNull();
  });

  it("shows Career Highlights heading", () => {
    render(<CareerHighlights results={[makeResult({ pos: 4 })]} />);
    expect(screen.getByText(/career highlights/i)).toBeTruthy();
  });
});
