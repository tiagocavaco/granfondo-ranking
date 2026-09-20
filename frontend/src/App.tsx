import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import EventList from "./components/events/EventList";
import EventDetail from "./components/events/EventDetail";
import AggregateRankingPage from "./components/athlete-ranking/AggregateRankingPage";
import TeamRankingPage from "./components/team-ranking/TeamRankingPage";
import AthleteProfile from "./components/athletes/AthleteProfile";
import AthletesPage from "./components/athletes/AthletesPage";
import TeamProfile from "./components/team-ranking/TeamProfile";
import ComparisonPage from "./components/comparison/ComparisonPage";
import AthleteRankingInfoPage from "./components/athlete-ranking/AthleteRankingInfoPage";
import TeamRankingInfoPage from "./components/team-ranking/TeamRankingInfoPage";
import PredictionsPage from "./components/predictions/PredictionsPage";
import PredictionsInfoPage from "./components/predictions/PredictionsInfoPage";
import NotFoundPage from "./components/shared/NotFoundPage";
import PrivacyPage from "./components/legal/PrivacyPage";
import TermsPage from "./components/legal/TermsPage";
import { NavBar } from "./components/shared/NavBar";
import { Footer } from "./components/shared/Footer";
import { ScrollToTop } from "./components/shared/ScrollToTop";
import { getDb } from "./db/db-client";
import { setGetDb } from "@granfondo/api";

setGetDb(getDb);

function DbLoadingScreen() {
  return (
    <div className="min-h-screen bg-[#060d1a] flex flex-col items-center justify-center gap-5">
      <div className="w-12 h-12 rounded-2xl bg-[#0b1d3a] flex items-center justify-center border border-white/[0.14] shadow-[0_0_20px_rgba(212,175,55,0.12)]">
        <svg
          viewBox="0 0 28 28"
          className="w-[22px] h-[22px]"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="7.5" cy="20" r="5.5" stroke="#16a34a" strokeWidth="2.5" />
          <circle
            cx="20.5"
            cy="20"
            r="5.5"
            stroke="#dc2626"
            strokeWidth="2.5"
          />
          <path
            d="M7.5 20 L12 10 L17 10 L14 20 Z"
            stroke="white"
            strokeWidth="2"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d="M17 10 L20.5 20"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M10 9 L13.5 9"
            stroke="#f59e0b"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="text-center">
        <div className="text-white font-display font-bold text-lg uppercase tracking-wide leading-none mb-1">
          Granfondo Portugal
        </div>
        <p className="text-slate-600 text-xs tracking-widest uppercase">
          Loading race data…
        </p>
      </div>
      <div
        className="animate-spin rounded-full h-5 w-5 border-[2px] border-white/10 border-t-blue-400"
        aria-label="Loading"
        role="status"
      />
    </div>
  );
}

function DbErrorScreen({ error }: { error: string }) {
  return (
    <div className="min-h-screen bg-[#060d1a] flex flex-col items-center justify-center gap-4 px-6">
      <div className="text-center max-w-sm">
        <div className="text-white font-display font-bold text-lg uppercase tracking-wide mb-3">
          Granfondo Portugal
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-5 py-4 text-sm text-red-300">
          <p className="font-semibold mb-1">Failed to load race data</p>
          <p className="text-red-400/70 text-xs">{error}</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 text-sm font-semibold text-blue-300 border border-blue-500/30 rounded-lg hover:bg-blue-500/10 transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

function AppShell() {
  return (
    <div className="min-h-screen relative z-[1]">
      <ScrollToTop />
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 sm:pt-8 pb-12">
        <Routes>
          <Route path="/" element={<EventList />} />
          <Route path="/events" element={<Navigate to="/" replace />} />
          <Route path="/event/:id" element={<EventDetail />} />
          <Route path="/event/:id/predictions" element={<PredictionsPage />} />
          <Route path="/athletes" element={<AthletesPage />} />
          <Route path="/athlete/:id" element={<AthleteProfile />} />
          <Route path="/athlete-ranking" element={<AggregateRankingPage />} />
          <Route path="/team-ranking" element={<TeamRankingPage />} />
          <Route path="/team/:teamId" element={<TeamProfile />} />
          <Route path="/compare" element={<ComparisonPage />} />
          <Route
            path="/athlete-ranking-info"
            element={<AthleteRankingInfoPage />}
          />
          <Route path="/team-ranking-info" element={<TeamRankingInfoPage />} />
          <Route path="/predictions-info" element={<PredictionsInfoPage />} />
          <Route
            path="/event/:id/predictions/info"
            element={<PredictionsInfoPage />}
          />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    getDb()
      .then(() => setDbReady(true))
      .catch((err: unknown) => setDbError(String(err)));
  }, []);

  if (dbError) {
    return <DbErrorScreen error={dbError} />;
  }

  if (!dbReady) {
    return <DbLoadingScreen />;
  }

  return (
    <BrowserRouter
      basename={import.meta.env.BASE_URL}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AppShell />
    </BrowserRouter>
  );
}
