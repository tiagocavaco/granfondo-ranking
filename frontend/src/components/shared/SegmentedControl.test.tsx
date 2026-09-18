import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SegmentedControl } from "./SegmentedControl";

const OPTIONS = ["all", "past", "upcoming"];

describe("SegmentedControl", () => {
  it("renders all option buttons", () => {
    render(
      <SegmentedControl
        label="Status"
        options={OPTIONS}
        value="all"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "all" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "past" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "upcoming" }),
    ).toBeInTheDocument();
  });

  it("marks selected option as aria-pressed", () => {
    render(
      <SegmentedControl
        label="Status"
        options={OPTIONS}
        value="past"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "past" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "all" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("calls onChange with the clicked option value", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Status"
        options={OPTIONS}
        value="all"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "past" }));
    expect(onChange).toHaveBeenCalledWith("past");
  });

  it("applies labelMap to display full labels instead of raw values", () => {
    const labelMap = { all: "All Events", past: "Past", upcoming: "Upcoming" };
    render(
      <SegmentedControl
        label="Status"
        options={OPTIONS}
        value="all"
        onChange={() => {}}
        labelMap={labelMap}
      />,
    );
    expect(
      screen.getByRole("button", { name: "All Events" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Past" })).toBeInTheDocument();
  });

  it("renders both short and full label spans when shortLabelMap is provided", () => {
    const labelMap = { all: "All Events" };
    const shortLabelMap = { all: "All" };
    render(
      <SegmentedControl
        label="Status"
        options={["all"]}
        value="all"
        onChange={() => {}}
        labelMap={labelMap}
        shortLabelMap={shortLabelMap}
      />,
    );
    // Both spans are rendered (CSS controls visibility)
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("All Events")).toBeInTheDocument();
  });

  it("renders accessible group with the label", () => {
    render(
      <SegmentedControl
        label="Season"
        options={["2025"]}
        value="2025"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("group", { name: "Season" })).toBeInTheDocument();
  });
});
