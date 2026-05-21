import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";
import { api } from "../api";
import { resolveTeamId } from "../utils/lookups";
import type { AggregateRanking } from "@granfondo/database/types";
import { Spinner, ErrorBanner } from "./EventList";
import {
  countryFlag,
  SOLO_TEAM_KEYS,
  normalizeTeam,
} from "@granfondo/database/normalize";

function pointsBarColor(pts: number, max: number) {
  const pct = pts / max;
  if (pct > 0.6) {
    return "from-blue-500 to-indigo-600";
  }

  if (pct > 0.3) {
    return "from-violet-400 to-blue-500";
  }

  return "from-slate-300 to-slate-400";
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-yellow-400 to-amber-500 text-white font-black text-base shadow-md">
        🥇
      </span>
    );
  }

  if (rank === 2) {
    return (
      <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-slate-300 to-slate-400 text-white font-black text-base shadow-sm">
        🥈
      </span>
    );
  }

  if (rank === 3) {
    return (
      <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-orange-400 to-orange-500 text-white font-black text-base shadow-sm">
        🥉
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center w-9 h-9 rounded-xl text-xs font-bold ${
        rank <= 10 ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      {rank}
    </span>
  );
}

export default function AggregateRankingPage() {
  const [data, setData] = useState<AggregateRanking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [year, setYear] = useState<string>("");
  const [distance, setDistance] = useState<string>("");
  const [gender, setGender] = useState<"M" | "F">("M");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api
      .getAggregateRanking()
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

  const ranked = useMemo(() => {
    if (!data || !year || !distance) {
      return [];
    }

    const list = data[year]?.[distance]?.[gender] ?? [];
    const withRank = list.map((a, i) => ({ ...a, rank: i + 1 }));
    if (!search) {
      return withRank;
    }

    const q = search.toLowerCase();
    return withRank.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.team ?? "").toLowerCase().includes(q),
    );
  }, [data, year, distance, gender, search]);

  // Max points from rank #1 (unaffected by search filter) for bar scaling
  const maxPoints = useMemo(() => {
    if (!data || !year || !distance) {
      return 1;
    }

    const list = data[year]?.[distance]?.[gender] ?? [];
    return list[0]?.totalPoints ?? 1;
  }, [data, year, distance, gender]);

  const resetKey = `${year}|${distance}|${gender}|${search}`;
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

  const topThree = ranked.slice(0, 3);

  return (
    <div>
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Athlete Ranking
          </h2>
        </div>
        <div className="sm:hidden">
          <GenderToggle
            value={gender}
            onChange={(g) => {
              setGender(g as "M" | "F");
              setExpanded(null);
              setSearch("");
            }}
          />
        </div>
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
              Granfondo: {
                active: "bg-blue-600 text-white",
                base: "text-blue-700 border-blue-200",
              },
              Mediofondo: {
                active: "bg-violet-600 text-white",
                base: "text-violet-700 border-violet-200",
              },
              Minifondo: {
                active: "bg-emerald-600 text-white",
                base: "text-emerald-700 border-emerald-200",
              },
              "Time Trial": {
                active: "bg-amber-500 text-white",
                base: "text-amber-700 border-amber-200",
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
            onChange={(g) => {
              setGender(g as "M" | "F");
              setExpanded(null);
              setSearch("");
            }}
          />
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
          {/* Podium — top 3 */}
          {topThree.length >= 3 && !search && (
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-8">
              {[topThree[1], topThree[0], topThree[2]].map((a, podiumIdx) => {
                const realRank = a.rank;
                const isFirst = realRank === 1;
                const podiumTeamId =
                  a.team && !SOLO_TEAM_KEYS.has(normalizeTeam(a.team))
                    ? resolveTeamId(a.team)
                    : undefined;
                return (
                  <div
                    key={a.id}
                    className={`rounded-2xl p-3 sm:p-5 text-center relative overflow-hidden border ${
                      isFirst
                        ? "bg-gradient-to-b from-amber-50 to-white border-amber-200 shadow-md hover:shadow-lg"
                        : podiumIdx === 0
                          ? "bg-gradient-to-b from-slate-50 to-white border-slate-200 hover:border-slate-300"
                          : "bg-gradient-to-b from-orange-50 to-white border-orange-200 hover:border-orange-300"
                    } ${isFirst ? "mt-0" : "mt-4"} transition-shadow`}
                  >
                    <Link
                      to={`/athlete/${a.id}`}
                      className="absolute inset-0"
                      aria-label={a.name}
                    />
                    <div className="relative">
                      <div className="text-2xl sm:text-4xl mb-1 sm:mb-2">
                        {realRank === 1 ? "🥇" : realRank === 2 ? "🥈" : "🥉"}
                      </div>
                      <div className="font-extrabold text-slate-900 text-xs sm:text-sm leading-tight mb-1 line-clamp-2">
                        <span className="mr-1" title={a.country}>
                          {countryFlag(a.country)}
                        </span>
                        {a.name}
                      </div>
                      {podiumTeamId !== undefined ? (
                        <Link
                          to={`/team/${podiumTeamId}`}
                          className="text-[10px] sm:text-xs text-slate-500 mb-2 sm:mb-3 truncate hidden sm:block hover:text-blue-600 transition-colors"
                        >
                          {a.team}
                        </Link>
                      ) : (
                        <div className="text-[10px] sm:text-xs text-slate-500 mb-2 sm:mb-3 truncate hidden sm:block">
                          {a.team}
                        </div>
                      )}
                      <div
                        className={`text-lg sm:text-2xl font-black ${
                          isFirst ? "text-amber-600" : "text-slate-700"
                        }`}
                      >
                        {a.totalPoints}
                      </div>
                      <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium">
                        pts
                      </div>
                      <div className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 hidden sm:block">
                        {a.eventsScored} races · best #{a.bestPos}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Full table */}
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              <span className="font-semibold text-slate-700">
                {ranked.length}
              </span>{" "}
              athletes scored
            </p>
            <Link
              to="/ranking-info"
              className="text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors"
            >
              How scoring works →
            </Link>
          </div>

          <div
            className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto bg-white"
            id="ranking-table"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-2 sm:px-4 py-3 text-left w-10 sm:w-14">
                    Rank
                  </th>
                  <th className="px-2 sm:px-4 py-3 text-left">Athlete</th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell">
                    Team
                  </th>
                  <th className="px-4 py-3 text-center hidden sm:table-cell w-20">
                    Races
                  </th>
                  <th className="px-4 py-3 text-center hidden md:table-cell w-20">
                    Best Pos
                  </th>
                  <th className="px-2 sm:px-4 py-3 text-right w-20 sm:w-32">
                    Points
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ranked.slice(0, visibleCount).map((a) => (
                  <React.Fragment key={a.id}>
                    <tr
                      onClick={() =>
                        setExpanded(
                          expanded === String(a.id) ? null : String(a.id),
                        )
                      }
                      className={`cursor-pointer transition-colors hover:bg-blue-50/40 ${
                        expanded === String(a.id) ? "bg-blue-50/60" : ""
                      } ${a.rank <= 3 ? "bg-slate-50/40" : ""}`}
                    >
                      <td className="px-2 sm:px-4 py-3">
                        <RankBadge rank={a.rank} />
                      </td>
                      <td className="px-2 sm:px-4 py-3 w-full max-w-0 overflow-hidden">
                        <Link
                          to={`/athlete/${a.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-semibold text-slate-900 hover:text-blue-600 transition-colors"
                        >
                          <span className="mr-1.5" title={a.country}>
                            {countryFlag(a.country)}
                          </span>
                          {a.name}
                        </Link>
                        {(() => {
                          const teamId =
                            a.team && !SOLO_TEAM_KEYS.has(normalizeTeam(a.team))
                              ? resolveTeamId(a.team)
                              : undefined;
                          return (
                            <div className="text-xs text-slate-400 lg:hidden mt-0.5 truncate">
                              {teamId !== undefined ? (
                                <Link
                                  to={`/team/${teamId}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="hover:text-blue-600 transition-colors"
                                >
                                  {a.team}
                                </Link>
                              ) : (
                                <span>{a.team}</span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs hidden lg:table-cell whitespace-nowrap">
                        {(() => {
                          const teamId =
                            a.team && !SOLO_TEAM_KEYS.has(normalizeTeam(a.team))
                              ? resolveTeamId(a.team)
                              : undefined;
                          return teamId !== undefined ? (
                            <Link
                              to={`/team/${teamId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-blue-600 transition-colors"
                            >
                              {a.team}
                            </Link>
                          ) : (
                            <span>{a.team}</span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600 font-medium hidden sm:table-cell">
                        {a.eventsScored}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600 hidden md:table-cell">
                        <span className="font-semibold text-slate-800">
                          #{a.bestPos}
                        </span>
                      </td>
                      <td className="px-2 sm:px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Mini bar */}
                          <div className="hidden sm:block w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${pointsBarColor(a.totalPoints, maxPoints)}`}
                              style={{
                                width: `${(a.totalPoints / maxPoints) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="font-extrabold text-blue-700 tabular-nums inline-block w-14 text-right">
                            {a.totalPoints.toFixed(1)}
                          </span>
                        </div>
                      </td>
                    </tr>

                    {expanded === String(a.id) && (
                      <tr key={`${a.id}-detail`}>
                        <td
                          colSpan={6}
                          className="px-4 pb-4 pt-1 bg-blue-50/60"
                        >
                          <div className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
                            Race breakdown
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                            {a.results.map((r) => (
                              <div
                                key={r.eventId}
                                className="bg-white rounded-lg px-3 py-2 border border-blue-100 flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <div className="text-xs font-medium text-slate-700 truncate">
                                    {r.eventName}
                                  </div>
                                  <div className="text-[11px] text-slate-400">
                                    {r.eventDate}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 text-xs">
                                  <span className="text-slate-500">
                                    P
                                    <strong className="text-slate-800">
                                      {r.pos}
                                    </strong>
                                  </span>
                                  <span className="text-slate-400">
                                    {r.basePoints} × {r.coefficient}
                                  </span>
                                  <span className="text-slate-400 hidden sm:inline">
                                    ({r.distanceFinishers} fin.)
                                  </span>
                                  <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                    +{r.points}
                                  </span>
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
          <p className="text-5xl mb-3">🏆</p>
          <p className="font-semibold text-slate-600 text-lg">
            No ranking data available
          </p>
        </div>
      )}
    </div>
  );
}

function GenderToggle({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm shrink-0">
      {[
        { v: "M", label: "Men" },
        { v: "F", label: "Women" },
      ].map(({ v, label }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-3 py-1.5 text-sm font-semibold transition-all ${
            value === v
              ? v === "M"
                ? "bg-blue-600 text-white"
                : "bg-pink-500 text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span className="sm:hidden">{v}</span>
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

function SegmentedControl({
  label,
  options,
  value,
  onChange,
  colorMap,
  labelMap,
  shortLabelMap,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  colorMap?: Record<string, { active: string; base: string }>;
  labelMap?: Record<string, string>;
  shortLabelMap?: Record<string, string>;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">
        {label}
      </span>
      <div className="flex flex-1 sm:flex-none rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        {options.map((o) => {
          const colors = colorMap?.[o];
          const fullLabel = labelMap?.[o] ?? o;
          const shortLabel = shortLabelMap?.[o];
          return (
            <button
              key={o}
              onClick={() => onChange(o)}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition-all ${
                value === o
                  ? (colors?.active ?? "bg-blue-600 text-white")
                  : `text-slate-600 hover:bg-slate-50 ${colors ? "border-r last:border-r-0 " + colors.base : ""}`
              }`}
            >
              {shortLabel ? (
                <>
                  <span className="sm:hidden">{shortLabel}</span>
                  <span className="hidden sm:inline">{fullLabel}</span>
                </>
              ) : (
                fullLabel
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
