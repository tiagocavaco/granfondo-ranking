import { useEffect, useState } from "react";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";
import { api } from "../api";
import type { StoredEventResults, StoredResult, StoredDistance } from "../types";
import { Spinner, ErrorBanner } from "./EventList";

interface Props {
  eventId: number;
  distances: StoredDistance[];
}

const DIST_ACTIVE: Record<string, string> = {
  Granfondo: "bg-blue-600 text-white",
  GranFondo: "bg-blue-600 text-white",
  Mediofondo: "bg-violet-600 text-white",
  Minifondo: "bg-emerald-600 text-white",
  "Time Trial": "bg-amber-500 text-white",
  "TIME TRIAL": "bg-amber-500 text-white",
};

export default function RankingsTab({ eventId, distances }: Props) {
  const [data, setData] = useState<StoredEventResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDistId, setActiveDistId] = useState<string>(distances[0]?.id ?? "");

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getResults(eventId)
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => {
    if (distances.length > 0) setActiveDistId(distances[0].id);
  }, [distances]);

  const activeResults =
    data?.distances.find((d) => d.id === activeDistId) ?? data?.distances[0];

  return (
    <div>
      {distances.length > 1 && (
        <div className="flex gap-2 mb-6 flex-wrap">
          {distances.map((d) => (
            <button
              key={d.id}
              onClick={() => setActiveDistId(d.id)}
              className={`px-5 py-2 text-sm rounded-xl font-semibold transition-all border ${
                activeDistId === d.id
                  ? (DIST_ACTIVE[d.name] ?? "bg-blue-600 text-white") + " border-transparent shadow-sm"
                  : "bg-white border-slate-200 text-slate-600 hover:border-blue-300"
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}

      {loading && <Spinner />}
      {error && <ErrorBanner>Results not available yet.</ErrorBanner>}

      {!loading && !error && activeResults && (
        <ResultsTable results={activeResults.results} finisherCount={activeResults.finisherCount} />
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

function ResultsTable({ results, finisherCount }: { results: StoredResult[]; finisherCount: number }) {
  const [search, setSearch] = useState("");

  const filtered = search
    ? results.filter(
        (r) =>
          r.name.toLowerCase().includes(search.toLowerCase()) ||
          r.team.toLowerCase().includes(search.toLowerCase()) ||
          r.bib.includes(search)
      )
    : results;

  const { visibleCount, sentinelRef } = useInfiniteScroll(filtered.length, search);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-slate-700">{finisherCount.toLocaleString()}</span> finishers
        </p>
        <input
          type="text"
          placeholder="Search name, team, bib…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 px-3.5 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
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
