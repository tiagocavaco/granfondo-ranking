import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "@granfondo/api";
import type { TeamRanking, TeamEntry } from "@granfondo/database/types";
import { Spinner, ErrorBanner } from "../shared/Spinner";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
import { usePageTitle } from "../../hooks/usePageTitle";
import { RankBadge } from "../shared/RankBadge";
import { MedalBadge } from "../shared/MedalBadge";
import { SegmentedControl } from "../shared/SegmentedControl";
import { rankTextColor, rankBorderAccent } from "../../utils/posStyle";
import { ScrollSentinel } from "../shared/ScrollSentinel";
import { PointsBadge } from "../shared/PointsBadge";

export default function TeamRankingPage() {
  const [data, setData] = useState<TeamRanking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [year, setYear] = useState<string>("");
  const [distance, setDistance] = useState<string>("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  usePageTitle("Team Ranking");

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
        <div className="text-[10px] font-black tracking-[0.3em] text-blue-500/70 uppercase mb-2">
          Portuguese Granfondo Series
        </div>
        <h1 className="font-display font-bold text-4xl sm:text-5xl text-white tracking-wide uppercase">
          Team Ranking
        </h1>
      </div>

      {/* Filters */}
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
            onChange={(e) => handleDistChange(e.target.value)}
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
            onChange={handleDistChange}
            colorMap={{
              Granfondo: {
                active:
                  "bg-blue-500/30 text-blue-300 border-r border-blue-500/20",
              },
              Mediofondo: {
                active:
                  "bg-violet-500/30 text-violet-300 border-r border-violet-500/20",
              },
              Minifondo: {
                active:
                  "bg-emerald-500/30 text-emerald-300 border-r border-emerald-500/20",
              },
              "Time Trial": {
                active:
                  "bg-amber-500/30 text-amber-300 border-r border-amber-500/20",
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
        <input
          type="text"
          placeholder="Search team…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-48 sm:min-w-0 sm:ml-auto px-3.5 py-2 text-sm rounded-xl input-dark focus:outline-none"
        />
      </div>

      {loading && <Spinner />}
      {error && <ErrorBanner>Failed to load team ranking: {error}</ErrorBanner>}

      {!loading && !error && ranked.length > 0 && (
        <>
          {/* Podium — top 3 */}
          {topThree.length >= 3 &&
            !search &&
            (() => {
              const first = topThree[0]!;
              const second = topThree[1]!;
              const third = topThree[2]!;

              const TeamCard = ({
                t,
                animDelay,
                isMobileFirst = false,
              }: {
                t: typeof first;
                animDelay: number;
                isMobileFirst?: boolean;
              }) => {
                const isFirst = t.rank === 1;
                const isSecond = t.rank === 2;
                const cardBase =
                  "rounded-2xl relative overflow-hidden border transition-all duration-300";
                const cardStyle = isFirst
                  ? `${cardBase} bg-gradient-to-b from-amber-500/10 to-[#0c1628] border-amber-500/25 glow-gold hover:border-amber-400/40`
                  : isSecond
                    ? `${cardBase} bg-gradient-to-b from-slate-400/10 to-[#0c1628] border-white/[0.08] hover:border-white/[0.15]`
                    : `${cardBase} bg-gradient-to-b from-orange-500/10 to-[#0c1628] border-orange-500/20 hover:border-orange-400/35`;
                return (
                  <div
                    key={t.team}
                    style={{ animationDelay: `${animDelay}ms` }}
                    className={`animate-in ${cardStyle}`}
                  >
                    {isFirst && (
                      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-amber-400/0 via-amber-300 to-amber-400/0" />
                    )}
                    <Link
                      to={`/team/${t.teamId}`}
                      className="absolute inset-0 z-10"
                      aria-label={t.team}
                    />
                    <div
                      className={`text-center ${isMobileFirst ? "px-4 pt-5 pb-4" : "px-2.5 pt-4 pb-3"}`}
                    >
                      <div className="mb-2 flex justify-center">
                        <MedalBadge
                          rank={t.rank as 1 | 2 | 3}
                          size={isMobileFirst ? "lg" : "sm"}
                        />
                      </div>
                      <div
                        className={`leading-tight mb-1.5 line-clamp-2 ${isMobileFirst ? "font-black text-amber-100 text-sm" : "font-bold text-slate-200 text-xs"}`}
                      >
                        {t.team}
                      </div>
                      <div
                        className={`font-black tabular-nums ${isMobileFirst ? "text-2xl text-amber-400" : "text-lg text-slate-300"}`}
                      >
                        {t.totalPoints}
                      </div>
                      <div
                        className={`text-[10px] font-medium ${isMobileFirst ? "text-amber-500" : "text-slate-600"}`}
                      >
                        pts
                      </div>
                      <div className="text-[10px] text-slate-600 mt-0.5 hidden sm:block">
                        {t.eventsScored} events · best #{t.bestRank}
                      </div>
                    </div>
                  </div>
                );
              };

              return (
                <div className="mb-8">
                  {/* Mobile: 1st full-width on top, 2nd+3rd side by side */}
                  <div className="sm:hidden space-y-2">
                    <TeamCard t={first} animDelay={0} isMobileFirst />
                    <div className="grid grid-cols-2 gap-2">
                      <TeamCard t={second} animDelay={150} />
                      <TeamCard t={third} animDelay={300} />
                    </div>
                  </div>
                  {/* Desktop: [2nd] [1st] [3rd] */}
                  <div className="hidden sm:grid sm:grid-cols-3 sm:gap-3 sm:items-end">
                    <div className="mt-4">
                      <TeamCard t={second} animDelay={150} />
                    </div>
                    <TeamCard t={first} animDelay={0} isMobileFirst />
                    <div className="mt-4">
                      <TeamCard t={third} animDelay={300} />
                    </div>
                  </div>
                </div>
              );
            })()}

          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              <span className="font-semibold text-slate-300">
                {ranked.length}
              </span>{" "}
              teams scored
            </p>
            <Link
              to="/team-ranking-info"
              className="text-xs text-blue-400 hover:text-blue-300 hover:underline transition-colors"
            >
              How scoring works →
            </Link>
          </div>

          <div className="rounded-2xl border border-white/[0.07] overflow-hidden overflow-x-auto bg-[#0c1628]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#060d1a] text-xs text-slate-500 uppercase tracking-wider border-b border-white/[0.06]">
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
              <tbody className="divide-y divide-white/[0.04]">
                {ranked.slice(0, visibleCount).map((t) => (
                  <React.Fragment key={t.team}>
                    <tr
                      onClick={() =>
                        setExpanded(expanded === t.team ? null : t.team)
                      }
                      className={`cursor-pointer transition-colors hover:bg-white/[0.03] ${
                        expanded === t.team ? "bg-blue-500/[0.06]" : ""
                      } ${t.rank <= 3 ? "bg-white/[0.02]" : ""}`}
                    >
                      <td
                        className={`py-3 pl-2 pr-4 ${rankBorderAccent(t.rank)}`}
                      >
                        <RankBadge rank={t.rank} />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/team/${t.teamId}`}
                          onClick={(e) => e.stopPropagation()}
                          className={`hover:text-blue-300 transition-colors ${t.rank <= 10 ? "font-bold text-white" : "font-semibold text-slate-100"}`}
                        >
                          {t.team}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-500 font-medium hidden sm:table-cell">
                        {t.eventsScored}
                      </td>
                      <td className="px-4 py-3 text-center hidden md:table-cell">
                        <span
                          className={`font-semibold tabular-nums ${rankTextColor(t.bestRank, "text-slate-400")}`}
                        >
                          #{t.bestRank}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="hidden sm:block w-20 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
                              style={{
                                width: `${(t.totalPoints / maxPoints) * 100}%`,
                              }}
                            />
                          </div>
                          <span
                            className={`font-extrabold tabular-nums inline-block w-14 text-right ${rankTextColor(t.rank, "text-blue-400")}`}
                          >
                            {t.totalPoints.toFixed(1)}
                          </span>
                        </div>
                      </td>
                    </tr>

                    {expanded === t.team && (
                      <tr key={`${t.team}-detail`}>
                        <td
                          colSpan={5}
                          className="px-4 pb-4 pt-1 bg-blue-500/[0.04]"
                        >
                          <div className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
                            Race breakdown
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {t.results.map((r) => (
                              <div
                                key={r.eventId}
                                className="bg-white/[0.03] rounded-xl border border-white/[0.07] p-3"
                              >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div>
                                    <div className="text-xs font-semibold text-slate-300">
                                      {r.eventName}
                                    </div>
                                    <div className="text-[11px] text-slate-600">
                                      {r.eventDate}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0 text-xs">
                                    <span
                                      className={`font-semibold tabular-nums ${r.teamRank <= 3 ? "text-amber-400" : "text-slate-300"}`}
                                    >
                                      #{r.teamRank}
                                    </span>
                                    <span className="text-slate-600">
                                      {r.basePoints}×{r.coefficient}
                                    </span>
                                    <span className="text-slate-600 hidden sm:inline">
                                      ({r.totalTeams} teams)
                                    </span>
                                    <PointsBadge points={r.points} />
                                  </div>
                                </div>
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
                                              ? "bg-amber-500/20 text-amber-400"
                                              : i === 1
                                                ? "bg-white/10 text-slate-400"
                                                : "bg-orange-500/20 text-orange-400"
                                          }`}
                                        >
                                          {i + 1}
                                        </span>
                                        {a.id ? (
                                          <Link
                                            to={`/athlete/${a.id}`}
                                            className="font-medium text-slate-400 hover:text-blue-300 transition-colors"
                                          >
                                            {a.name}
                                          </Link>
                                        ) : (
                                          <span className="font-medium text-slate-400">
                                            {a.name}
                                          </span>
                                        )}
                                        <span className="text-slate-600 ml-auto">
                                          pos #{a.pos}
                                        </span>
                                      </div>
                                    ))}
                                  <div className="text-[11px] text-slate-600 mt-1 pt-1 border-t border-white/[0.06]">
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
            <ScrollSentinel
              sentinelRef={sentinelRef}
              visible={visibleCount}
              total={ranked.length}
            />
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
