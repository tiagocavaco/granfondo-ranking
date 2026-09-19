import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MedalBadge, CatPosBadge, MedalIcon } from "./MedalBadge";

describe("MedalBadge", () => {
  it("renders an SVG for rank 1 with gold inner color", () => {
    const { container } = render(<MedalBadge rank={1} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    // Gold: inner stop is amber #fbbf24
    expect(container.innerHTML).toContain("#fbbf24");
  });

  it("renders an SVG for rank 2 with silver inner color", () => {
    const { container } = render(<MedalBadge rank={2} />);
    expect(container.innerHTML).toContain("#e2e8f0");
  });

  it("renders an SVG for rank 3 with bronze inner color", () => {
    const { container } = render(<MedalBadge rank={3} />);
    expect(container.innerHTML).toContain("#fb923c");
  });

  it("lg size uses 56px dimensions", () => {
    const { container } = render(<MedalBadge rank={1} size="lg" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("56");
    expect(svg?.getAttribute("height")).toBe("56");
  });

  it("sm size uses 40px dimensions", () => {
    const { container } = render(<MedalBadge rank={1} size="sm" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("40");
    expect(svg?.getAttribute("height")).toBe("40");
  });

  it("renders the rank number in the SVG text element", () => {
    const { container } = render(<MedalBadge rank={2} />);
    const text = container.querySelector("text");
    expect(text?.textContent).toBe("2");
  });
});

describe("CatPosBadge", () => {
  it("pos 1 renders a span with amber styling", () => {
    const { container } = render(<CatPosBadge pos={1} />);
    const span = container.querySelector("span");
    expect(span?.className).toContain("amber");
    expect(span?.textContent).toBe("1");
  });

  it("pos 2 renders a span with slate styling", () => {
    const { container } = render(<CatPosBadge pos={2} />);
    const span = container.querySelector("span");
    expect(span?.className).toContain("slate");
  });

  it("pos 3 renders a span with orange styling", () => {
    const { container } = render(<CatPosBadge pos={3} />);
    const span = container.querySelector("span");
    expect(span?.className).toContain("orange");
  });

  it("pos 4 renders a muted border badge", () => {
    const { container } = render(<CatPosBadge pos={4} />);
    const span = container.querySelector("span");
    // pos 4 uses bg-white/[0.05] — muted, no amber/orange/slate color class
    expect(span?.className).not.toContain("amber");
    expect(span?.className).not.toContain("orange");
    expect(span?.textContent).toBe("4");
  });

  it("pos 5+ renders plain text with # prefix", () => {
    render(<CatPosBadge pos={7} />);
    expect(screen.getByText("#7")).toBeTruthy();
  });

  it("pos 5+ span has no badge border classes", () => {
    const { container } = render(<CatPosBadge pos={5} />);
    const span = container.querySelector("span");
    expect(span?.className).not.toContain("border");
  });
});

describe("MedalIcon", () => {
  it("renders an 18×18 SVG", () => {
    const { container } = render(<MedalIcon rank={1} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("18");
    expect(svg?.getAttribute("height")).toBe("18");
  });

  it("uses the correct gold color for rank 1", () => {
    const { container } = render(<MedalIcon rank={1} />);
    expect(container.innerHTML).toContain("#fbbf24");
  });
});
