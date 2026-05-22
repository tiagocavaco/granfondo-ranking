import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "@granfondo/api";
import type { AggregateRanking } from "@granfondo/database/types";
import { Spinner, ErrorBanner } from "./EventList";
import { SegmentedControl } from "./shared/SegmentedControl";
import { GenderToggle } from "./shared/GenderToggle";
import { AggregateRankingPodium } from "./AggregateRankingPodium";
import { AggregateRankingTable } from "./AggregateRankingTable";

export default function AggregateRankingPage() {
  const [data, setData] = useState<AggregateRanking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [year, setYear] = useState("");
  const [distance, setDistance] = useState("");
  const [gender, setGender] = useState<"M" | "F">("M");
  const [search, setSearch] = useState("");

  useEffect(() => {
    api
      .getAggregateRanking()
      .then((d) => {
        setData(d);
        const years = Object.keys(d).sort().reverse();
        const defaultYear = years[0] ?? "";
        setYear(defaultYear);
        setDistance(Object.keys(d[defaultYear] ?? {})[0] ?? "");
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const years = useMemo(() => (data ? Object.keys(data).sort().reverse() : []), [data]);
  const distances = useMemo(() => (data && year ? Object.keys(data[year] ?? {}) : []), [data, year]);

  const ranked = useMemo(() => {
    if (!data || !year || !distance) return [];
    const list = data[year]?.[distance]?.[gender] ?? [];
    const withRank = list.map((a, i) => ({ ...a, rank: i + 1 }));
    if (!search) return withRank;
    const q = search.toLowerCase();
    return withRank.filter(
      (a) => a.name.toLowerCase().includes(q) || (a.team ?? "").toLowerCase().includes(q),
    );
  }, [data, year, distance, gender, search]);

  const maxPoints = useMemo(() => {
    if (!data || !year || !distance) return 1;
    return data[year]?.[distance]?.[gender]?.[0]?.totalPoints ?? 1;
  }, [data, year, distance, gender]);

  const handleYearChange = (y: string) => {
    setYear(y);
    setDistance(Object.keys(data?.[y] ?? {})[0] ?? "");
    setSearch("");
  };

  const topThree = ranked.slice(0, 3);
  const resetKey = `${year}|${distance}|${gender}|${search}`;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-8">
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Athlete Ranking</h2>
        <div className="sm:hidden">
          <GenderToggle value={gender} onChange={(g) => { setGender(g as "M" | "F"); setSearch(""); }} />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 mb-8 sm:items-center">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">Season</span>
          <select
            value={year}
            onChange={(e) => handleYearChange(e.target.value)}
            className="flex-1 sm:flex-none px-3.5 py-1.5 text-sm font-semibold border border-slate-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-600"
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex sm:hidden items-center gap-2.5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">Distance</span>
          <select
            value={distance}
            onChange={(e) => { setDistance(e.target.value); setSearch(""); }}
            className="flex-1 px-3.5 py-1.5 text-sm font-semibold border border-slate-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-600"
          >
            {distances.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="hidden sm:block">
          <SegmentedControl
            label="Distance"
            options={distances}
            value={distance}
            onChange={(d) => { setDistance(d); setSearch(""); }}
            colorMap={{
              Granfondo: { active: "bg-blue-600 text-white", base: "text-blue-700 border-blue-200" },
              Mediofondo: { active: "bg-violet-600 text-white", base: "text-violet-700 border-violet-200" },
              Minifondo: { active: "bg-emerald-600 text-white", base: "text-emerald-700 border-emerald-200" },
              "Time Trial": { active: "bg-amber-500 text-white", base: "text-amber-700 border-amber-200" },
            }}
            shortLabelMap={{ Granfondo: "GF", Mediofondo: "MF", Minifondo: "Mini", "Time Trial": "TT" }}
          />
        </div>
        <div className="hidden sm:flex items-center gap-2.5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">Gender</span>
          <GenderToggle value={gender} onChange={(g) => { setGender(g as "M" | "F"); setSearch(""); }} />
        </div>
        <input
          type="text"
          placeholder="Search athlete or team…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-52 sm:ml-auto px-3.5 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {loading && <Spinner />}
      {error && <ErrorBanner>Failed to load ranking: {error}</ErrorBanner>}

      {!loading && !error && ranked.length > 0 && (
        <>
          {topThree.length >= 3 && !search && <AggregateRankingPodium topThree={topThree} />}

          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              <span className="font-semibold text-slate-700">{ranked.length}</span> athletes scored
            </p>
            <Link to="/ranking-info" className="text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors">
              How scoring works →
            </Link>
          </div>

          <AggregateRankingTable ranked={ranked} maxPoints={maxPoints} resetKey={resetKey} />
        </>
      )}

      {!loading && !error && ranked.length === 0 && year && distance && (
        <div className="text-center py-16 text-slate-400">
          <p className="text-5xl mb-3">🏆</p>
          <p className="font-semibold text-slate-600 text-lg">No ranking data available</p>
        </div>
      )}
    </div>
  );
}
