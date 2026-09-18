import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "@granfondo/api";
import type { AggregateRanking } from "@granfondo/database/types";
import { Spinner, ErrorBanner } from "../shared/Spinner";
import { SegmentedControl } from "../shared/SegmentedControl";
import { GenderToggle } from "../shared/GenderToggle";
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

  const years = useMemo(
    () => (data ? Object.keys(data).sort().reverse() : []),
    [data],
  );
  const distances = useMemo(
    () => (data && year ? Object.keys(data[year] ?? {}) : []),
    [data, year],
  );

  const ranked = useMemo(() => {
    if (!data || !year || !distance) return [];
    const list = data[year]?.[distance]?.[gender] ?? [];
    const withRank = list.map((a, i) => ({ ...a, rank: i + 1 }));
    if (!search) return withRank;
    const query = search.toLowerCase();
    return withRank.filter(
      (athlete) =>
        athlete.name.toLowerCase().includes(query) ||
        (athlete.team ?? "").toLowerCase().includes(query),
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
        <div>
          <div className="text-[10px] font-black tracking-[0.3em] text-blue-500/70 uppercase mb-2">
            Portuguese Granfondo Series
          </div>
          <h2 className="font-display font-bold text-4xl sm:text-5xl text-white tracking-wide uppercase">
            Athlete Ranking
          </h2>
        </div>
        <div className="sm:hidden mt-7">
          <GenderToggle
            value={gender}
            onChange={(next) => {
              setGender(next as "M" | "F");
              setSearch("");
            }}
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-8 sm:items-center">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">
            Season
          </span>
          <select
            value={year}
            onChange={(e) => handleYearChange(e.target.value)}
            className="flex-1 sm:flex-none px-3.5 py-1.5 text-sm font-semibold rounded-xl input-dark focus:outline-none"
          >
            {years.map((y) => (
              <option key={y} value={y} className="bg-[#0c1628]">
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="flex sm:hidden items-center gap-2.5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">
            Distance
          </span>
          <select
            value={distance}
            onChange={(e) => {
              setDistance(e.target.value);
              setSearch("");
            }}
            className="flex-1 px-3.5 py-1.5 text-sm font-semibold rounded-xl input-dark focus:outline-none"
          >
            {distances.map((d) => (
              <option key={d} value={d} className="bg-[#0c1628]">
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="hidden sm:block">
          <SegmentedControl
            label="Distance"
            options={distances}
            value={distance}
            onChange={(d) => {
              setDistance(d);
              setSearch("");
            }}
            colorMap={{
              Granfondo: {
                active: "bg-blue-500/30 text-blue-300 border-r border-blue-500/20",
              },
              Mediofondo: {
                active: "bg-violet-500/30 text-violet-300 border-r border-violet-500/20",
              },
              Minifondo: {
                active: "bg-emerald-500/30 text-emerald-300 border-r border-emerald-500/20",
              },
              "Time Trial": {
                active: "bg-amber-500/30 text-amber-300 border-r border-amber-500/20",
              },
            }}
            shortLabelMap={{
              Granfondo: "GF",
              Mediofondo: "MF",
              Minifondo: "Mini",
              "Time Trial": "TT",
            }}
          />
        </div>
        <div className="hidden sm:flex items-center gap-2.5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">
            Gender
          </span>
          <GenderToggle
            value={gender}
            onChange={(next) => {
              setGender(next as "M" | "F");
              setSearch("");
            }}
          />
        </div>
        <input
          type="text"
          placeholder="Search athlete or team…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-52 sm:min-w-0 sm:ml-auto px-3.5 py-2 text-sm rounded-xl input-dark focus:outline-none"
        />
      </div>

      {loading && <Spinner />}
      {error && <ErrorBanner>Failed to load ranking: {error}</ErrorBanner>}

      {!loading && !error && ranked.length > 0 && (
        <>
          {topThree.length >= 3 && !search && (
            <AggregateRankingPodium topThree={topThree} />
          )}

          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              <span className="font-semibold text-slate-300">
                {ranked.length}
              </span>{" "}
              athletes scored
            </p>
            <Link
              to="/ranking-info"
              className="text-xs text-blue-400 hover:text-blue-300 hover:underline transition-colors"
            >
              How scoring works →
            </Link>
          </div>

          <AggregateRankingTable
            ranked={ranked}
            maxPoints={maxPoints}
            resetKey={resetKey}
          />
        </>
      )}

      {!loading && !error && ranked.length === 0 && year && distance && (
        <div className="text-center py-16 text-slate-400">
          <svg className="w-12 h-12 mx-auto mb-3 text-slate-700" viewBox="0 0 24 24" fill="currentColor"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/></svg>
          <p className="font-semibold text-slate-600 text-lg">
            No ranking data available
          </p>
        </div>
      )}
    </div>
  );
}
