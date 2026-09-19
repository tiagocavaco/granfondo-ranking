import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TeamLink } from "./TeamLink";

const mockResolveTeamId = vi.fn();

vi.mock("@granfondo/api", () => ({
  resolveTeamId: (name: string) => mockResolveTeamId(name),
}));

function renderLink(team: string) {
  return render(
    <MemoryRouter>
      <TeamLink team={team} />
    </MemoryRouter>,
  );
}

describe("TeamLink", () => {
  it("renders a link to /team/:id for a known real team", () => {
    mockResolveTeamId.mockReturnValue(42);
    renderLink("Sporting");
    const link = screen.getByRole("link", { name: "Sporting" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/team/42");
  });

  it("renders plain text (no link) when resolveTeamId returns undefined", () => {
    mockResolveTeamId.mockReturnValue(undefined);
    renderLink("Unknown Club");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Unknown Club")).toBeInTheDocument();
  });

  it("renders plain text (no link) for 'Independente' solo key", () => {
    mockResolveTeamId.mockReturnValue(99);
    renderLink("Independente");
    // SOLO_TEAM_KEYS check fires before resolveTeamId, so no link even if ID would resolve
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Independente")).toBeInTheDocument();
  });

  it("renders plain text for empty string team", () => {
    mockResolveTeamId.mockReturnValue(undefined);
    renderLink("");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders plain text for 'Sem Equipa' solo key (case-insensitive normalisation)", () => {
    mockResolveTeamId.mockReturnValue(5);
    renderLink("Sem Equipa");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
