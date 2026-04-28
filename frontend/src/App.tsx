import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import EventList from "./components/EventList";
import EventDetail from "./components/EventDetail";
import AggregateRankingPage from "./components/AggregateRankingPage";
import TeamRankingPage from "./components/TeamRankingPage";
import AthleteProfile from "./components/AthleteProfile";
import AthletesPage from "./components/AthletesPage";
import TeamProfile from "./components/TeamProfile";
import ComparisonPage from "./components/ComparisonPage";
import { api } from "./api";

export default function App() {
  const [lookupsFailed, setLookupsFailed] = useState(false);
  useEffect(() => {
    api.initLookups().catch(() => setLookupsFailed(true));
  }, []);
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <header className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 shadow-xl sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-6">
            {/* Logo */}
            <div className="flex items-center gap-3 mr-2">
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
            <nav className="flex gap-0.5 sm:gap-1">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `px-3 sm:px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                    isActive
                      ? "bg-white/15 text-white backdrop-blur-sm"
                      : "text-blue-200 hover:text-white hover:bg-white/8"
                  }`
                }
              >
                Events
              </NavLink>
              <NavLink
                to="/athletes"
                className={({ isActive }) =>
                  `px-3 sm:px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                    isActive
                      ? "bg-white/15 text-white backdrop-blur-sm"
                      : "text-blue-200 hover:text-white hover:bg-white/8"
                  }`
                }
              >
                Athletes
              </NavLink>
              <NavLink
                to="/ranking"
                className={({ isActive }) =>
                  `px-3 sm:px-4 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                    isActive
                      ? "bg-white/15 text-white backdrop-blur-sm"
                      : "text-blue-200 hover:text-white hover:bg-white/8"
                  }`
                }
              >
                <span className="hidden sm:inline">🏆 </span>
                <span className="sm:hidden">Ranking</span>
                <span className="hidden sm:inline">Athlete Ranking</span>
              </NavLink>
              <NavLink
                to="/teams"
                className={({ isActive }) =>
                  `px-3 sm:px-4 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                    isActive
                      ? "bg-white/15 text-white backdrop-blur-sm"
                      : "text-blue-200 hover:text-white hover:bg-white/8"
                  }`
                }
              >
                <span className="hidden sm:inline">🏅 </span>
                <span className="sm:hidden">Teams</span>
                <span className="hidden sm:inline">Team Ranking</span>
              </NavLink>
            </nav>
          </div>
        </header>

        {lookupsFailed && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-sm px-4 py-2 text-center">
            Athlete profile links are unavailable — data may be loading or out of date.
          </div>
        )}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <Routes>
            <Route path="/" element={<EventList />} />
            <Route path="/event/:id" element={<EventDetail />} />
            <Route path="/athletes" element={<AthletesPage />} />
            <Route path="/athlete/:id" element={<AthleteProfile />} />
            <Route path="/ranking" element={<AggregateRankingPage />} />
            <Route path="/teams" element={<TeamRankingPage />} />
            <Route path="/team/:teamName" element={<TeamProfile />} />
            <Route path="/compare" element={<ComparisonPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
