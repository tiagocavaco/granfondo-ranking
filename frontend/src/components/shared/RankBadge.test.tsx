import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { RankBadge } from "./RankBadge";

describe("RankBadge", () => {
  it("rank 1 renders a MedalBadge SVG (not a text span)", () => {
    const { container } = render(<RankBadge rank={1} />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("rank 2 renders a MedalBadge SVG", () => {
    const { container } = render(<RankBadge rank={2} />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("rank 3 renders a MedalBadge SVG", () => {
    const { container } = render(<RankBadge rank={3} />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("rank 4 renders a blue-tinted text badge", () => {
    const { container } = render(<RankBadge rank={4} />);
    expect(container.querySelector("svg")).toBeNull();
    // Single span (no nested wrapper for non-medal ranks)
    const span = container.querySelector("span");
    expect(span?.className).toContain("blue");
    expect(span?.textContent).toBe("4");
  });

  it("rank 10 still uses the blue badge (boundary)", () => {
    const { container } = render(<RankBadge rank={10} />);
    const span = container.querySelector("span");
    expect(span?.className).toContain("blue");
  });

  it("rank 11 uses the muted badge (boundary)", () => {
    const { container } = render(<RankBadge rank={11} />);
    const span = container.querySelector("span");
    expect(span?.className).not.toContain("blue");
    expect(span?.className).toContain("slate-500");
    expect(span?.textContent).toBe("11");
  });

  it("rank 50 uses the muted badge", () => {
    const { container } = render(<RankBadge rank={50} />);
    const span = container.querySelector("span");
    expect(span?.className).toContain("slate-500");
  });
});
