import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GenderToggle } from "./GenderToggle";

describe("GenderToggle", () => {
  it("renders both M and F buttons", () => {
    render(<GenderToggle value="M" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /^M/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^F/ })).toBeInTheDocument();
  });

  it("marks the active gender button as pressed", () => {
    render(<GenderToggle value="M" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /^M/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /^F/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("marks F as pressed when value is F", () => {
    render(<GenderToggle value="F" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /^F/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /^M/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("calls onChange with 'F' when Women is clicked", () => {
    const onChange = vi.fn();
    render(<GenderToggle value="M" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /^F/ }));
    expect(onChange).toHaveBeenCalledWith("F");
  });

  it("calls onChange with 'M' when Men is clicked", () => {
    const onChange = vi.fn();
    render(<GenderToggle value="F" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /^M/ }));
    expect(onChange).toHaveBeenCalledWith("M");
  });

  it("has accessible group label", () => {
    render(<GenderToggle value="M" onChange={() => {}} />);
    expect(
      screen.getByRole("group", { name: /filter by gender/i }),
    ).toBeInTheDocument();
  });
});
