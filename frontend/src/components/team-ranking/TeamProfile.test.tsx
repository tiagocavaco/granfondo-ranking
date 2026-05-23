import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TeamProfile from "./TeamProfile";

const mockGetTeamRanking = vi.fn();
const mockInitLookups = vi.fn();
const mockGetTeamById = vi.fn();

vi.mock("@granfondo/api", () => ({
  api: {
    getTeamRanking: () => mockGetTeamRanking(),
    initLookups: () => mockInitLookups(),
    getTeamById: (id: number) => mockGetTeamById(id),
  },
  resolveTeamKey: () => null,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/team/:teamId" element={<TeamProfile />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mkEntry(over: Record<string, unknown> = {}) {
  return {
    rank: 1,
    team: "Sporting",
    teamId: 1,
    teamKey: "sporting",
    totalPoints: 100,
    eventsScored: 2,
    bestRank: 1,
    results: [],
    ...over,
  };
}

function mkDetail() {
  return {
    displayName: "Sporting",
    teamKey: "sporting",
    aliases: [],
    canonicalKey: "sporting",
    events: [
      {
        eventId: 10,
        eventName: "Granfondo Algarve",
        eventDate: "2025-04-01",
        distance: "Granfondo",
        finisherCount: 100,
        athletes: [
          {
            id: 1,
            name: "João Silva",
            pos: 5,
            raceTime: "3:00:00",
            dnf: 0,
            dns: 0,
            country: "PRT",
            category: "Masters A Male",
          },
        ],
      },
    ],
  };
}

beforeEach(() => {
  mockGetTeamRanking.mockReset();
  mockInitLookups.mockReset();
  mockGetTeamById.mockReset();
  mockInitLookups.mockResolvedValue({ teamsLoaded: true });
});

describe("TeamProfile", () => {
  it("renders the team display name once data resolves", async () => {
    mockGetTeamRanking.mockResolvedValue({
      "2025": { Granfondo: [mkEntry()] },
    });
    mockGetTeamById.mockResolvedValue(mkDetail());

    renderAt("/team/1");
    expect(await screen.findByRole("heading", { name: "Sporting" })).toBeInTheDocument();
  });

  it("shows the 'Team not found' state when the detail lookup returns null", async () => {
    mockGetTeamRanking.mockResolvedValue({});
    mockGetTeamById.mockResolvedValue(null);

    renderAt("/team/999");
    expect(await screen.findByText(/Team not found/i)).toBeInTheDocument();
  });

  it("renders all distinct seasons from ranking + detail events", async () => {
    mockGetTeamRanking.mockResolvedValue({
      "2024": { Granfondo: [mkEntry({ totalPoints: 50 })] },
      "2025": { Granfondo: [mkEntry()] },
    });
    mockGetTeamById.mockResolvedValue({
      ...mkDetail(),
      events: [
        { ...mkDetail().events[0]!, eventDate: "2024-05-01" },
        { ...mkDetail().events[0]!, eventDate: "2025-04-01" },
      ],
    });

    renderAt("/team/1");
    await screen.findByRole("heading", { name: "Sporting" });
    expect(screen.getByText(/2025 · 2024/)).toBeInTheDocument();
  });

  it("renders the members section when the detail returns athletes for the season", async () => {
    mockGetTeamRanking.mockResolvedValue({
      "2025": { Granfondo: [mkEntry()] },
    });
    mockGetTeamById.mockResolvedValue(mkDetail());

    renderAt("/team/1");
    await screen.findByRole("heading", { name: "Sporting" });
    expect(screen.getByText("João Silva")).toBeInTheDocument();
  });

  it("surfaces API errors", async () => {
    mockGetTeamRanking.mockRejectedValue(new Error("boom"));
    mockGetTeamById.mockResolvedValue(null);

    renderAt("/team/1");
    expect(await screen.findByText(/Team not found/i)).toBeInTheDocument();
  });
});
