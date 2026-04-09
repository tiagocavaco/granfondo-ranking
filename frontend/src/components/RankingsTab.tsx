import { useEffect, useState, useMemo } from "react";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";
import { api } from "../api";
import type { StoredEventResults, StoredResult, StoredDistanceResults, StoredDistance } from "../types";
import { Spinner, ErrorBanner } from "./EventList";

interface Props {
  eventId: number;
  distances: StoredDistance[];
}

export default function RankingsTab({ eventId }: Props) {
  const [data, setData] = useState<StoredEventResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getResults(eventId)
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [eventId]);

  return (
    <div>
      {loading && <Spinner />}
      {error && <ErrorBanner>Results not available yet.</ErrorBanner>}
      {!loading && !error && data && data.distances.length > 0 && (
        <ResultsTable distances={data.distances} />
      )}
    </div>
  );
}

function posStyle(pos: number) {
  if (pos === 1) return "bg-gradient-to-br from-yellow-400 to-amber-500 text-white shadow-sm";
  if (pos === 2) return "bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow-sm";
  if (pos === 3) return "bg-gradient-to-br from-orange-400 to-orange-500 text-white shadow-sm";
  if (pos <= 10) return "bg-blue-50 text-blue-700 font-semibold";
  return "bg-slate-100 text-slate-500";
}

function ResultsTable({ distances }: { distances: StoredDistanceResults[] }) {
  const defaultDistId =
    distances.find((d) => d.name === "Granfondo" || d.name === "GranFondo")?.id ??
    distances[0]?.id ??
    "";

  const [activeDistId, setActiveDistId] = useState(defaultDistId);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");

  const activeDist = distances.find((d) => d.id === activeDistId) ?? distances[0];
  const results: StoredResult[] = activeDist?.results ?? [];
  const finisherCount = activeDist?.finisherCount ?? 0;

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(results.map((r) => r.category).filter(Boolean))).sort()],
    [results]
  );

  const filtered = useMemo(() => results.filter((r) => {
    const matchSearch =
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.team.toLowerCase().includes(search.toLowerCase()) ||
      r.bib.includes(search);
    const matchCat = categoryFilter === "all" || r.category === categoryFilter;
    const matchGender = genderFilter === "all" || r.gender === genderFilter;
    return matchSearch && matchCat && matchGender;
  }), [results, search, categoryFilter, genderFilter]);

  const resetKey = `${activeDistId}|${search}|${categoryFilter}|${genderFilter}`;
  const { visibleCount, sentinelRef } = useInfiniteScroll(filtered.length, resetKey);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search name, team, bib…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48 px-3.5 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {distances.length > 1 && (
          <select
            value={activeDistId}
            onChange={(e) => { setActiveDistId(e.target.value); setCategoryFilter("all"); setGenderFilter("all"); setSearch(""); }}
            className="px-3.5 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {distances.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3.5 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All categories</option>
          {categories.slice(1).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={genderFilter}
          onChange={(e) => setGenderFilter(e.target.value)}
          className="px-3.5 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All genders</option>
          <option value="M">Men</option>
          <option value="F">Women</option>
        </select>
        <span className="text-sm text-slate-500 ml-auto">
          <span className="font-semibold text-slate-700">{filtered.length.toLocaleString()}</span>
          {" in "}{activeDist?.name}{" of "}{finisherCount.toLocaleString()}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-100">
              <th className="px-4 py-3 text-left w-14">Pos</th>
              <th className="px-4 py-3 text-left w-16">Bib</th>
              <th className="px-4 py-3 text-left">Athlete</th>
              <th className="px-4 py-3 text-left hidden md:table-cell">Team</th>
              <th className="px-4 py-3 text-left hidden sm:table-cell">Cat</th>
              <th className="px-4 py-3 text-center hidden sm:table-cell">G</th>
              <th className="px-4 py-3 text-right">Time</th>
              <th className="px-4 py-3 text-right hidden sm:table-cell">Gap</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.slice(0, visibleCount).map((r, i) => (
              <tr
                key={i}
                className={`transition-colors hover:bg-slate-50/60 ${
                  r.dnf || r.dns ? "opacity-40" : ""
                } ${r.pos <= 3 ? "bg-slate-50/30" : ""}`}
              >
                <td className="px-4 py-3">
                  {r.dnf || r.dns ? (
                    <span className="text-xs text-slate-400 font-bold">
                      {r.dnf ? "DNF" : "DNS"}
                    </span>
                  ) : (
                    <span
                      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold ${posStyle(r.pos)}`}
                    >
                      {r.pos}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">{r.bib}</td>
                <td className="px-4 py-3 font-semibold text-slate-900">{r.name}</td>
                <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell max-w-[140px] truncate">
                  {r.team}
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs hidden sm:table-cell">{r.category}</td>
                <td className="px-4 py-3 text-center hidden sm:table-cell">
                  <span
                    className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                      r.gender === "F"
                        ? "bg-pink-50 text-pink-600"
                        : "bg-blue-50 text-blue-600"
                    }`}
                  >
                    {r.gender}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-slate-700">
                  {r.raceTime}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs text-slate-400 hidden sm:table-cell">
                  {r.gap}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-slate-400">No results found</div>
        )}
        {visibleCount < filtered.length && (
          <div ref={sentinelRef} className="px-4 py-3 text-xs text-slate-400 border-t border-slate-100 text-center">
            Showing {visibleCount} of {filtered.length}…
          </div>
        )}
      </div>
    </div>
  );
}
