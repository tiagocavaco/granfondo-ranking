import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "@granfondo/api";
import type { TeamRanking, TeamEntry } from "@granfondo/database/types";
import { Spinner, ErrorBanner } from "./EventList";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";
import { RankBadge } from "./shared/RankBadge";
import { SegmentedControl } from "./shared/SegmentedControl";
import { rankLabel } from "../utils/rankLabel";


export default function TeamRankingPage() {
  const [data, setData] = useState<TeamRanking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [year, setYear] = useState<string>("");
  const [distance, setDistance] = useState<string>("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api
      .getTeamRanking()
      .then((d) => {
        setData(d);
        const years = Object.keys(d).sort().reverse();
        const defaultYear = years[0] ?? "";
        setYear(defaultYear);
        const distances = defaultYear ? Object.keys(d[defaultYear] ?? {}) : [];
        setDistance(distances[0] ?? "");
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

  const teams: TeamEntry[] = useMemo(() => {
    if (!data || !year || !distance) {
      return [];
    }

    const list = data[year]?.[distance] ?? [];
    if (!search) {
      return list;
    }

    return list.filter((t) =>
      t.team.toLowerCase().includes(search.toLowerCase()),
    );
  }, [data, year, distance, search]);

  const ranked = useMemo(
    () => teams.map((t, i) => ({ ...t, rank: i + 1 })),
    [teams],
  );
  const maxPoints = ranked[0]?.totalPoints ?? 1;
  const topThree = ranked.slice(0, 3);

  const resetKey = `${year}|${distance}|${search}`;
  const { visibleCount, sentinelRef } = useInfiniteScroll(
    ranked.length,
    resetKey,
  );

  const handleYearChange = (y: string) => {
    setYear(y);
    const dists = data ? Object.keys(data[y] ?? {}) : [];
    setDistance(dists[0] ?? "");
    setExpanded(null);
    setSearch("");
  };

  const handleDistChange = (d: string) => {
    setDistance(d);
    setExpanded(null);
    setSearch("");
  };

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Team Ranking
        </h2>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 mb-8 sm:items-center">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">
            Season
          </span>
          <select
            value={year}
            onChange={(e) => handleYearChange(e.target.value)}
            className="flex-1 sm:flex-none px-3.5 py-1.5 text-sm font-semibold border border-slate-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-600"
          >
            {years.map((y) => (
              <option key={y} value={y}>
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
            onChange={(e) => handleDistChange(e.target.value)}
            className="flex-1 px-3.5 py-1.5 text-sm font-semibold border border-slate-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-600"
          >
            {distances.map((d) => (
              <option key={d} value={d}>
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
            onChange={handleDistChange}
            colorMap={{
              Granfondo: { active: "bg-blue-600 text-white" },
              Mediofondo: { active: "bg-violet-600 text-white" },
              Minifondo: { active: "bg-emerald-600 text-white" },
              "Time Trial": { active: "bg-amber-500 text-white" },
            }}
            shortLabelMap={{
              Granfondo: "GF",
              Mediofondo: "MF",
              Minifondo: "Mini",
              "Time Trial": "TT",
            }}
          />
        </div>
        <input
          type="text"
          placeholder="Search team…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-48 sm:ml-auto px-3.5 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {loading && <Spinner />}
      {error && <ErrorBanner>Failed to load team ranking: {error}</ErrorBanner>}

      {!loading && !error && ranked.length > 0 && (
        <>
          {/* Podium — top 3 */}
          {topThree.length >= 3 && !search && (
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-8">
              {[topThree[1], topThree[0], topThree[2]].map((t, podiumIdx) => {
                const isFirst = t.rank === 1;
                return (
                  <div
                    key={t.team}
                    className={`rounded-2xl p-3 sm:p-5 text-center relative overflow-hidden border ${
                      isFirst
                        ? "bg-gradient-to-b from-amber-50 to-white border-amber-200 shadow-md"
                        : podiumIdx === 0
                          ? "bg-gradient-to-b from-slate-50 to-white border-slate-200"
                          : "bg-gradient-to-b from-orange-50 to-white border-orange-200"
                    } ${isFirst ? "mt-0" : "mt-4"}`}
                  >
                    <div className="text-2xl sm:text-4xl mb-1 sm:mb-2">
                      {t.rank === 1 ? "🥇" : t.rank === 2 ? "🥈" : "🥉"}
                    </div>
                    <Link
                      to={`/team/${t.teamId}`}
                      className="font-extrabold text-slate-900 text-xs sm:text-sm leading-tight mb-2 sm:mb-3 line-clamp-2 hover:text-blue-700 transition-colors block"
                    >
                      {t.team}
                    </Link>
                    <div
                      className={`text-lg sm:text-2xl font-black ${isFirst ? "text-amber-600" : "text-slate-700"}`}
                    >
                      {t.totalPoints}
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium">
                      pts
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 hidden sm:block">
                      {t.eventsScored} events · best {rankLabel(t.bestRank)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              <span className="font-semibold text-slate-700">
                {ranked.length}
              </span>{" "}
              teams scored
            </p>
            <Link
              to="/teams-info"
              className="text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors"
            >
              How scoring works →
            </Link>
          </div>

          <div className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-4 py-3 text-left w-14">Rank</th>
                  <th className="px-4 py-3 text-left">Team</th>
                  <th className="px-4 py-3 text-center hidden sm:table-cell w-20">
                    Events
                  </th>
                  <th className="px-4 py-3 text-center hidden md:table-cell w-24">
                    Best Rank
                  </th>
                  <th className="px-4 py-3 text-right w-32">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ranked.slice(0, visibleCount).map((t) => (
                  <React.Fragment key={t.team}>
                    <tr
                      onClick={() =>
                        setExpanded(expanded === t.team ? null : t.team)
                      }
                      className={`cursor-pointer transition-colors hover:bg-blue-50/40 ${
                        expanded === t.team ? "bg-blue-50/60" : ""
                      } ${t.rank <= 3 ? "bg-slate-50/40" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <RankBadge rank={t.rank} />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/team/${t.teamId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-semibold text-slate-900 hover:text-blue-600 transition-colors"
                        >
                          {t.team}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600 font-medium hidden sm:table-cell">
                        {t.eventsScored}
                      </td>
                      <td className="px-4 py-3 text-center hidden md:table-cell">
                        <span className="font-semibold text-slate-800">
                          {rankLabel(t.bestRank)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="hidden sm:block w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600"
                              style={{
                                width: `${(t.totalPoints / maxPoints) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="font-extrabold text-blue-700 tabular-nums inline-block w-14 text-right">
                            {t.totalPoints.toFixed(1)}
                          </span>
                        </div>
                      </td>
                    </tr>

                    {expanded === t.team && (
                      <tr key={`${t.team}-detail`}>
                        <td
                          colSpan={5}
                          className="px-4 pb-4 pt-1 bg-blue-50/60"
                        >
                          <div className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
                            Race breakdown
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {t.results.map((r) => (
                              <div
                                key={r.eventId}
                                className="bg-white rounded-xl border border-blue-100 p-3"
                              >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div>
                                    <div className="text-xs font-semibold text-slate-700">
                                      {r.eventName}
                                    </div>
                                    <div className="text-[11px] text-slate-400">
                                      {r.eventDate}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0 text-xs">
                                    <span className="font-semibold text-slate-700">
                                      {rankLabel(r.teamRank)}
                                    </span>
                                    <span className="text-slate-400">
                                      {r.basePoints}×{r.coefficient}
                                    </span>
                                    <span className="text-slate-400 hidden sm:inline">
                                      ({r.totalTeams} teams)
                                    </span>
                                    <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                      +{r.points}
                                    </span>
                                  </div>
                                </div>
                                {/* Top 3 athletes */}
                                <div className="space-y-0.5">
                                  {r.athletes
                                    .filter((a) => a.scoring)
                                    .map((a, i) => (
                                      <div
                                        key={i}
                                        className="flex items-center gap-2 text-[11px] text-slate-500"
                                      >
                                        <span
                                          className={`w-4 h-4 rounded-full flex items-center justify-center font-bold text-[10px] ${
                                            i === 0
                                              ? "bg-yellow-100 text-yellow-700"
                                              : i === 1
                                                ? "bg-slate-100 text-slate-500"
                                                : "bg-orange-100 text-orange-600"
                                          }`}
                                        >
                                          {i + 1}
                                        </span>
                                        {a.id ? (
                                          <Link
                                            to={`/athlete/${a.id}`}
                                            className="font-medium text-slate-700 hover:text-blue-600 transition-colors"
                                          >
                                            {a.name}
                                          </Link>
                                        ) : (
                                          <span className="font-medium text-slate-700">
                                            {a.name}
                                          </span>
                                        )}
                                        <span className="text-slate-400 ml-auto">
                                          pos #{a.pos}
                                        </span>
                                      </div>
                                    ))}
                                  <div className="text-[11px] text-slate-400 mt-1 pt-1 border-t border-slate-100">
                                    Combined score: {r.combinedScore} ·{" "}
                                    {r.eligibleTeams} eligible teams
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            {visibleCount < ranked.length && (
              <div
                ref={sentinelRef}
                className="px-4 py-3 text-xs text-slate-400 border-t border-slate-100 text-center"
              >
                Showing {visibleCount} of {ranked.length}…
              </div>
            )}
          </div>
        </>
      )}

      {!loading && !error && ranked.length === 0 && year && distance && (
        <div className="text-center py-16 text-slate-400">
          <p className="text-5xl mb-3">🏅</p>
          <p className="font-semibold text-slate-600 text-lg">
            No team ranking data available
          </p>
        </div>
      )}
    </div>
  );
}

