import { useEffect, useRef, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  useNavigate,
  useLocation,
} from "react-router-dom";
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
import { api, setGetDb } from "@granfondo/api";
import { getDb } from "./db/db-client";
import { formatAge } from "./utils/date";

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

setGetDb(getDb);

const navLink = (isActive: boolean) =>
  `px-3 sm:px-4 py-2 text-sm font-semibold rounded-lg transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[#020810] ${
    isActive
      ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
      : "text-slate-400 hover:text-white hover:bg-white/5"
  }`;

function AppShell() {
  const [lookupsFailed, setLookupsFailed] = useState(false);
  const [teamsUnavailable, setTeamsUnavailable] = useState(false);
  const [rankingsOpen, setRankingsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const headerRef = useRef<HTMLElement>(null);
  const isRankingsActive =
    location.pathname === "/ranking" || location.pathname === "/teams";

  useEffect(() => {
    api
      .initLookups()
      .then(({ teamsLoaded }) => {
        if (!teamsLoaded) {
          setTeamsUnavailable(true);
        }
      })
      .catch(() => setLookupsFailed(true));
  }, []);
  useEffect(() => {
    setRankingsOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        rankingsOpen &&
        headerRef.current &&
        !headerRef.current.contains(e.target as Node)
      ) {
        setRankingsOpen(false);
      }
    }

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [rankingsOpen]);

  return (
    <div className="min-h-screen relative z-[1]">
      <header
        ref={headerRef}
        className="bg-[#020810]/95 backdrop-blur-xl border-b border-white/[0.08] sticky top-0 z-50 [border-top:2px_solid_rgba(212,175,55,0.35)]"
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 flex items-center gap-2 sm:gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-[#0b1d3a] flex items-center justify-center border border-white/[0.14] shadow-[0_0_20px_rgba(212,175,55,0.12)] shrink-0">
              <svg
                viewBox="0 0 28 28"
                className="w-[19px] h-[19px] sm:w-[22px] sm:h-[22px]"
                fill="none"
              >
                {/* Rear wheel — Portugal green */}
                <circle
                  cx="7.5"
                  cy="20"
                  r="5.5"
                  stroke="#16a34a"
                  strokeWidth="2.5"
                />
                {/* Front wheel — Portugal red */}
                <circle
                  cx="20.5"
                  cy="20"
                  r="5.5"
                  stroke="#dc2626"
                  strokeWidth="2.5"
                />
                {/* Diamond frame */}
                <path
                  d="M7.5 20 L12 10 L17 10 L14 20 Z"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  fill="none"
                />
                {/* Fork */}
                <path
                  d="M17 10 L20.5 20"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                {/* Saddle — gold accent */}
                <path
                  d="M10 9 L13.5 9"
                  stroke="#f59e0b"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="hidden sm:block">
              <div className="text-white font-display font-bold text-xl leading-none tracking-wide uppercase">
                Granfondo Portugal
              </div>
              <div className="text-amber-400/50 text-[10px] font-medium tracking-widest uppercase mt-0.5">
                Race Events · Rankings
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex flex-1 justify-evenly sm:justify-start gap-0.5 sm:gap-1 min-w-0">
            <NavLink to="/" end className={({ isActive }) => navLink(isActive)}>
              Events
            </NavLink>
            <NavLink
              to="/athletes"
              className={({ isActive }) => navLink(isActive)}
            >
              Athletes
            </NavLink>
            {/* Mobile: dropdown trigger */}
            <button
              onClick={() => setRankingsOpen((v) => !v)}
              aria-expanded={rankingsOpen}
              aria-haspopup="true"
              className={`sm:hidden ${navLink(isRankingsActive)} flex items-center gap-1`}
            >
              Rankings
              <span
                aria-hidden="true"
                className={`text-[10px] transition-transform ${rankingsOpen ? "rotate-180" : ""}`}
              >
                ▾
              </span>
            </button>
            {/* Desktop: direct links */}
            <NavLink
              to="/ranking"
              className={({ isActive }) =>
                `hidden sm:flex items-center gap-1.5 ${navLink(isActive)}`
              }
            >
              <svg
                aria-hidden="true"
                className="w-3.5 h-3.5 shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z" />
              </svg>
              Athlete Ranking
            </NavLink>
            <NavLink
              to="/teams"
              className={({ isActive }) =>
                `hidden sm:flex items-center gap-1.5 ${navLink(isActive)}`
              }
            >
              <svg
                aria-hidden="true"
                className="w-3.5 h-3.5 shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
              </svg>
              Team Ranking
            </NavLink>
          </nav>
        </div>

        {/* Mobile rankings panel */}
        {rankingsOpen && (
          <div
            className="sm:hidden flex border-t border-white/[0.06] bg-[#020810]"
            role="menu"
          >
            <button
              role="menuitem"
              onClick={() => navigate("/ranking")}
              className={`flex-1 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400/60 ${
                location.pathname === "/ranking"
                  ? "text-blue-300 bg-blue-500/10"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <svg
                aria-hidden="true"
                className="w-3.5 h-3.5 shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z" />
              </svg>
              Athletes
            </button>
            <button
              role="menuitem"
              onClick={() => navigate("/teams")}
              className={`flex-1 py-3 text-sm font-semibold border-l border-white/[0.06] transition-colors flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400/60 ${
                location.pathname === "/teams"
                  ? "text-blue-300 bg-blue-500/10"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <svg
                aria-hidden="true"
                className="w-3.5 h-3.5 shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
              </svg>
              Teams
            </button>
          </div>
        )}
      </header>

      {lookupsFailed && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-sm px-4 py-2 text-center">
          Athlete profile links are unavailable — data may be loading or out of
          date.
        </div>
      )}
      {teamsUnavailable && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-sm px-4 py-2 text-center">
          Team profile links are unavailable — a re-scrape is needed to enable
          them.
        </div>
      )}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 sm:pt-8 pb-12">
        <Routes>
          <Route path="/" element={<EventList />} />
          <Route path="/event/:id" element={<EventDetail />} />
          <Route path="/event/:id/predictions" element={<PredictionsPage />} />
          <Route path="/athletes" element={<AthletesPage />} />
          <Route path="/athlete/:id" element={<AthleteProfile />} />
          <Route path="/ranking" element={<AggregateRankingPage />} />
          <Route path="/teams" element={<TeamRankingPage />} />
          <Route path="/team/:teamId" element={<TeamProfile />} />
          <Route path="/compare" element={<ComparisonPage />} />
          <Route path="/ranking-info" element={<AthleteRankingInfoPage />} />
          <Route path="/teams-info" element={<TeamRankingInfoPage />} />
          <Route path="/predictions-info" element={<PredictionsInfoPage />} />
          <Route
            path="/event/:id/predictions/info"
            element={<PredictionsInfoPage />}
          />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

function Footer() {
  const [scrapedAt, setScrapedAt] = useState<string>("");
  useEffect(() => {
    api
      .getStats()
      .then((s) => setScrapedAt(s.scrapedAt))
      .catch(() => {});
  }, []);
  return (
    <footer className="border-t border-white/[0.06] mt-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between text-xs text-slate-600">
        <span className="font-semibold text-slate-500">Granfondo Portugal</span>
        {scrapedAt && (
          <span className="text-slate-600">
            Data updated {formatAge(scrapedAt)}
          </span>
        )}
      </div>
    </footer>
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

  if (dbError) return <DbErrorScreen error={dbError} />;
  if (!dbReady) return <DbLoadingScreen />;

  return (
    <BrowserRouter
      basename={import.meta.env.BASE_URL}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AppShell />
    </BrowserRouter>
  );
}
