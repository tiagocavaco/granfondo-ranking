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

setGetDb(getDb);

const navLink = (isActive: boolean) =>
  `px-2.5 sm:px-4 py-2 text-sm font-semibold rounded-lg transition-all whitespace-nowrap ${
    isActive
      ? "bg-white/15 text-white backdrop-blur-sm"
      : "text-blue-200 hover:text-white hover:bg-white/8"
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
    <div className="min-h-screen bg-slate-50">
      <header
        ref={headerRef}
        className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 shadow-xl sticky top-0 z-50"
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 flex items-center gap-2 sm:gap-6">
          {/* Logo */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-lg backdrop-blur-sm border border-white/10 shrink-0">
              🚴
            </div>
            <div className="hidden sm:block">
              <div className="text-white font-extrabold text-lg leading-tight tracking-tight">
                Granfondo Portugal
              </div>
              <div className="text-blue-300 text-[11px] font-medium tracking-widest uppercase">
                Race Results · Rankings
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
              className={`sm:hidden ${navLink(isRankingsActive)} flex items-center gap-1`}
            >
              Rankings
              <span
                className={`text-[10px] transition-transform ${rankingsOpen ? "rotate-180" : ""}`}
              >
                ▾
              </span>
            </button>
            {/* Desktop: direct links */}
            <NavLink
              to="/ranking"
              className={({ isActive }) =>
                `hidden sm:block ${navLink(isActive)}`
              }
            >
              🏆 Athlete Ranking
            </NavLink>
            <NavLink
              to="/teams"
              className={({ isActive }) =>
                `hidden sm:block ${navLink(isActive)}`
              }
            >
              🏅 Team Ranking
            </NavLink>
          </nav>
        </div>

        {/* Mobile rankings panel — in normal flow so it pushes content down */}
        {rankingsOpen && (
          <div className="sm:hidden flex border-t border-white/10 bg-black/20">
            <button
              onClick={() => navigate("/ranking")}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                location.pathname === "/ranking"
                  ? "text-white bg-white/15"
                  : "text-blue-200 hover:text-white hover:bg-white/8"
              }`}
            >
              🏆 Athletes
            </button>
            <button
              onClick={() => navigate("/teams")}
              className={`flex-1 py-3 text-sm font-semibold border-l border-white/10 transition-colors ${
                location.pathname === "/teams"
                  ? "text-white bg-white/15"
                  : "text-blue-200 hover:text-white hover:bg-white/8"
              }`}
            >
              🏅 Teams
            </button>
          </div>
        )}
      </header>

      {lookupsFailed && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-sm px-4 py-2 text-center">
          Athlete profile links are unavailable — data may be loading or out of
          date.
        </div>
      )}
      {teamsUnavailable && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-sm px-4 py-2 text-center">
          Team profile links are unavailable — a re-scrape is needed to enable
          them.
        </div>
      )}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 sm:pt-8 pb-8">
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
    <footer className="border-t border-slate-200 mt-4">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between text-xs text-slate-400">
        <span>Granfondo Portugal</span>
        {scrapedAt && <span>Data updated {formatAge(scrapedAt)}</span>}
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <BrowserRouter
      basename={import.meta.env.BASE_URL}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AppShell />
    </BrowserRouter>
  );
}
