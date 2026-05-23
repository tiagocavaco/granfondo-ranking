import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  render,
  screen,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PredictionsPage from "./PredictionsPage";
import type { DistancePredictions, FavoritePrediction } from "@granfondo/api";

const mockGetEvents = vi.fn();
const mockGetPredictions = vi.fn();
const mockNavigate = vi.fn();

vi.mock("@granfondo/api", () => ({
  api: {
    getEvents: () => mockGetEvents(),
    getPredictions: (id: number) => mockGetPredictions(id),
  },
}));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/event/:id/predictions" element={<PredictionsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mkPrediction(
  over: Partial<FavoritePrediction> = {},
): FavoritePrediction {
  return {
    athleteId: 1,
    name: "João Silva",
    distance: "Granfondo",
    category: "Masters A Male",
    gender: "M",
    team: "Sporting",
    country: "PRT",
    weightedScore: 50,
    raceCount: 3,
    mainDistance: "Granfondo",
    ...over,
  };
}

beforeEach(() => {
  mockGetEvents.mockReset();
  mockGetPredictions.mockReset();
  mockNavigate.mockReset();
});

describe("PredictionsPage", () => {
  it("shows the event name once predictions resolve", async () => {
    mockGetEvents.mockResolvedValue([
      { id: 5, name: "Granfondo Algarve", hasResults: false },
    ]);
    const preds: Record<string, DistancePredictions> = {
      Granfondo: {
        overallMale: mkPrediction(),
        overallFemale: null,
        categories: {
          "Masters A Male": { ranked: [mkPrediction()], newcomers: 0 },
        },
      },
    };
    mockGetPredictions.mockResolvedValue(preds);

    renderAt("/event/5/predictions");
    expect(await screen.findByText("Granfondo Algarve")).toBeInTheDocument();
  });

  it("redirects to the event page when the event already has results", async () => {
    mockGetEvents.mockResolvedValue([
      { id: 5, name: "Granfondo Algarve", hasResults: true },
    ]);
    mockGetPredictions.mockResolvedValue({});

    renderAt("/event/5/predictions");
    await waitForElementToBeRemoved(
      () => screen.queryByRole("status", { hidden: true }),
      {
        timeout: 2000,
      },
    ).catch(() => {});
    // Navigation happens after the events resolve.
    await vi.waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/event/5", { replace: true }),
    );
  });

  it("renders the 'no predictions available' empty state when distance buckets are empty", async () => {
    mockGetEvents.mockResolvedValue([
      { id: 5, name: "Granfondo Algarve", hasResults: false },
    ]);
    mockGetPredictions.mockResolvedValue({});

    renderAt("/event/5/predictions");
    expect(
      await screen.findByText(/No predictions available yet/i),
    ).toBeInTheDocument();
  });

  it("surfaces errors when the API call fails", async () => {
    mockGetEvents.mockRejectedValue(new Error("boom"));
    mockGetPredictions.mockResolvedValue({});

    renderAt("/event/5/predictions");
    expect(
      await screen.findByText(/Predictions unavailable/i),
    ).toBeInTheDocument();
  });

  it("annotates ranked categories with the unranked newcomer count", async () => {
    mockGetEvents.mockResolvedValue([
      { id: 5, name: "Granfondo Algarve", hasResults: false },
    ]);
    const preds: Record<string, DistancePredictions> = {
      Granfondo: {
        overallMale: mkPrediction(),
        overallFemale: null,
        categories: {
          "Masters A Male": {
            ranked: [mkPrediction()],
            newcomers: 7,
          },
        },
      },
    };
    mockGetPredictions.mockResolvedValue(preds);

    renderAt("/event/5/predictions");
    await screen.findByText("Granfondo Algarve");
    // "+7 unranked" badge sits next to the category header.
    expect(screen.getByText(/\+7 unranked/i)).toBeInTheDocument();
  });
});
