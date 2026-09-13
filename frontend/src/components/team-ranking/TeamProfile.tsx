import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@granfondo/api";
import type { TeamRanking, TeamEntry } from "@granfondo/database/types";
import { Spinner } from "../shared/Spinner";
import { distBadgeClass } from "../../utils/distance";
import { DISTANCES } from "@granfondo/utils/distance";
import { TeamMemberList } from "./TeamMemberList";

export default function TeamProfile() {
  const { teamId: teamIdParam } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const teamId = Number(teamIdParam ?? 0);

  const [data, setData] = useState<TeamRanking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamDetail, setTeamDetail] = useState<
    | {
        displayName: string;
        events: Array<{
          eventId: number;
          eventName: string;
          eventDate: string;
          distance: string;
          athletes: Array<{
            id: number;
            name: string;
            pos: number;
            raceTime: string;
            dnf: number;
            dns: number;
            country: string;
            category: string;
          }>;
        }>;
      }
    | null
    | undefined
  >(undefined);

  useEffect(() => {
    Promise.all([
      api.getTeamRanking(),
      api.initLookups(),
      api.getTeamById(teamId),
    ])
      .then(([ranking, , detail]) => {
        setData(ranking);
        setTeamDetail(detail);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const teamEntries = useMemo(() => {
    if (!data || !teamDetail) {
      return [];
    }

    const entries: Array<{ year: string; distance: string; entry: TeamEntry }> =
      [];
    for (const [year, dists] of Object.entries(data)) {
      for (const [dist, teams] of Object.entries(dists)) {
        const entry = teams.find((t) => t.teamId === teamId);
        if (entry) {
          entries.push({ year, distance: dist, entry });
        }
      }
    }

    return entries.sort(
      (a, b) =>
        b.year.localeCompare(a.year) || a.distance.localeCompare(b.distance),
    );
  }, [data, teamId, teamDetail]);

  const totalEventsScored = teamEntries.reduce(
    (sum, { entry }) => sum + entry.eventsScored,
    0,
  );
  const seasons = [...new Set(teamEntries.map((e) => e.year))].sort().reverse();

  const detailSeasons = useMemo(() => {
    if (!teamDetail?.events) {
      return [];
    }

    return [...new Set(teamDetail.events.map((ev) => ev.eventDate.slice(0, 4)))]
      .sort()
      .reverse();
  }, [teamDetail?.events]);

  const allSeasons = useMemo(() => {
    return [...new Set([...seasons, ...detailSeasons])].sort().reverse();
  }, [seasons, detailSeasons]);

  const [selectedSeason, setSelectedSeason] = useState<string>("");
  const [expandedDists, setExpandedDists] = useState<Set<string>>(new Set());
  const RESULTS_PREVIEW = 5;
  const effectiveSeason = selectedSeason || allSeasons[0] || "";

  // All athletes who raced for this team in the selected season.
  // Country/category come directly from the event athletes. Team ranking podiums overlaid from teamEntries.
  const allSeasonMembers = useMemo(() => {
    if (!teamDetail?.events) {
      return [];
    }

    const seasonEvents = teamDetail.events.filter((ev) =>
      ev.eventDate.startsWith(effectiveSeason),
    );
    const map = new Map<
      number,
      {
        id: number;
        name: string;
        country: string;
        category: string;
        races: number;
        podiums: number;
      }
    >();
    for (const ev of seasonEvents) {
      for (const a of ev.athletes) {
        if (!a.id) {
          continue;
        }

        const existing = map.get(a.id);
        if (existing) {
          existing.races++;
        } else {
          map.set(a.id, {
            id: a.id,
            name: a.name,
            country: a.country,
            category: a.category,
            races: 1,
            podiums: 0,
          });
        }
      }
    }

    for (const { entry } of teamEntries.filter(
      (e) => e.year === effectiveSeason,
    )) {
      for (const r of entry.results) {
        if (r.teamRank > 3) {
          continue;
        }

        for (const a of r.athletes) {
          if (a.id && a.scoring) {
            const m = map.get(a.id);
            if (m) {
              m.podiums++;
            }
          }
        }
      }
    }

    return [...map.values()].sort(
      (a, b) =>
        b.races - a.races ||
        b.podiums - a.podiums ||
        a.name.localeCompare(b.name),
    );
  }, [teamDetail?.events, effectiveSeason, teamEntries]);

  const byYear = useMemo(() => {
    const map: Record<
      string,
      Array<{ distance: string; entry: TeamEntry }>
    > = {};
    for (const { year, distance, entry } of teamEntries) {
      (map[year] ??= []).push({ distance, entry });
    }

    return map;
  }, [teamEntries]);

  const nonQualifyingEvents = useMemo(() => {
    if (!teamDetail?.events) {
      return [];
    }

    const rankedKeys = new Set(
      (byYear[effectiveSeason] ?? []).flatMap(({ distance, entry }) =>
        entry.results.map((r) => `${r.eventId}|${distance}`),
      ),
    );
    return teamDetail.events.filter(
      (ev) =>
        ev.eventDate.startsWith(effectiveSeason) &&
        !rankedKeys.has(`${ev.eventId}|${ev.distance}`),
    );
  }, [teamDetail?.events, byYear, effectiveSeason]);

  const displayName =
    teamEntries[0]?.entry.team ?? teamDetail?.displayName ?? "";

  if (loading) {
    return <Spinner />;
  }

  if (error || !data) {
    return (
      <div className="text-center py-16 text-slate-400">
        <svg className="w-12 h-12 mx-auto mb-3 text-slate-700" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
        <p className="font-semibold text-slate-600 text-lg">Team not found</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 text-sm text-blue-600 hover:underline"
        >
          ← Go back
        </button>
      </div>
    );
  }

  if (teamEntries.length === 0) {
    if (teamDetail === undefined) {
      return <Spinner />;
    }

    if (teamDetail === null) {
      return (
        <div className="text-center py-16 text-slate-400">
          <svg className="w-12 h-12 mx-auto mb-3 text-slate-700" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
          <p className="font-semibold text-slate-600 text-lg">Team not found</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 text-sm text-blue-600 hover:underline"
          >
            ← Go back
          </button>
        </div>
      );
    }
  }

  const seasonEntries = byYear[effectiveSeason] ?? [];
  const effectiveMembers = allSeasonMembers;
  const effectiveTotalMembers = teamDetail?.events
    ? new Set(
        teamDetail.events.flatMap((ev) =>
          ev.athletes.map((a) => a.id).filter(Boolean),
        ),
      ).size
    : 0;
  const effectiveTotalEvents =
    totalEventsScored ||
    (teamDetail?.events
      ? new Set(teamDetail.events.map((ev) => ev.eventId)).size
      : 0);

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-slate-500 hover:text-slate-300 transition-colors mb-4 inline-flex items-center gap-1"
      >
        ← Back
      </button>

      {/* Hero */}
      <div className="relative bg-[#0c1628] rounded-2xl p-6 sm:p-8 mb-8 text-white overflow-hidden border border-white/[0.07]">
        {/* Top accent line */}
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-blue-400/0 via-blue-400/50 to-blue-400/0" />
        {/* Ghost initial watermark */}
        <div className="absolute right-0 top-0 bottom-0 flex items-center pr-4 select-none pointer-events-none opacity-[0.04]">
          <div className="text-[180px] sm:text-[220px] font-black text-white leading-none">
            {displayName.charAt(0)}
          </div>
        </div>

        <div className="relative">
          <h1 className="font-display font-bold text-3xl sm:text-4xl tracking-wide mb-1 leading-tight break-words uppercase">
            {displayName}
          </h1>
          <p className="text-slate-600 text-sm mb-0">{allSeasons.join(" · ")}</p>

          {/* Editorial stats strip */}
          <div className="flex items-stretch mt-5 pt-5 border-t border-white/[0.06]">
            <div className="flex flex-col items-center pr-4 sm:pr-6">
              <span className="text-2xl sm:text-3xl font-black tabular-nums text-white leading-none">
                {allSeasons.length}
              </span>
              <span className="text-[9px] sm:text-[10px] text-slate-600 font-bold uppercase tracking-widest mt-1">
                Seasons
              </span>
            </div>
            {effectiveTotalMembers > 0 && (
              <>
                <div className="w-[1px] self-stretch bg-white/[0.08] shrink-0" />
                <div className="flex flex-col items-center px-4 sm:px-6">
                  <span className="text-2xl sm:text-3xl font-black tabular-nums text-white leading-none">
                    {effectiveTotalMembers}
                  </span>
                  <span className="text-[9px] sm:text-[10px] text-slate-600 font-bold uppercase tracking-widest mt-1">
                    Members
                  </span>
                </div>
              </>
            )}
            {effectiveTotalEvents > 0 && (
              <>
                <div className="w-[1px] self-stretch bg-white/[0.08] shrink-0" />
                <div className="flex flex-col items-center pl-4 sm:pl-6">
                  <span className="text-2xl sm:text-3xl font-black tabular-nums text-white leading-none">
                    {effectiveTotalEvents}
                  </span>
                  <span className="text-[9px] sm:text-[10px] text-slate-600 font-bold uppercase tracking-widest mt-1">
                    Events
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Season selector — shared between members and results */}
      {allSeasons.length > 1 && (
        <div className="flex items-center gap-3 mb-6">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">
            Season
          </span>
          {/* Mobile: full-width select */}
          <select
            value={selectedSeason}
            onChange={(e) => setSelectedSeason(e.target.value)}
            className="sm:hidden flex-1 px-3 py-1.5 text-sm rounded-xl input-dark focus:outline-none font-semibold"
          >
            {allSeasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {/* Desktop: segmented pill toggle */}
          <div className="hidden sm:flex rounded-xl border border-white/[0.07] overflow-hidden bg-[#0c1628]">
            {allSeasons.map((s) => (
              <button
                key={s}
                onClick={() => setSelectedSeason(s)}
                className={`px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition-all ${
                  effectiveSeason === s
                    ? "bg-blue-500/30 text-blue-300"
                    : "text-slate-500 hover:text-slate-200 hover:bg-white/5"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Members */}
      {effectiveMembers.length > 0 && (
        <TeamMemberList members={effectiveMembers} />
      )}

      {/* Results for selected season */}
      {(seasonEntries.length > 0 || nonQualifyingEvents.length > 0) && (
        <h2 className="text-lg font-bold text-slate-200 mb-3">Results</h2>
      )}
      {seasonEntries.length > 0 && (
        <div className="mb-8">
          <div className="space-y-4">
            {seasonEntries.map(({ distance, entry }) => {
              const distKey = `${effectiveSeason}|${distance}`;
              const isExpanded = expandedDists.has(distKey);
              const sorted = [...entry.results].sort(
                (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime(),
              );
              const visible = isExpanded ? sorted : sorted.slice(0, RESULTS_PREVIEW);
              const hasMore = sorted.length > RESULTS_PREVIEW;

              return (
              <div
                key={distance}
                className="rounded-2xl border border-white/[0.07] overflow-hidden overflow-x-auto bg-[#0c1628]"
              >
                <div className="flex items-center justify-between px-4 py-3 bg-[#060d1a] border-b border-white/[0.06]">
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full ${distBadgeClass(distance)}`}
                  >
                    {distance}
                  </span>
                  <div className="text-xs text-slate-500 flex gap-3">
                    <span>
                      Best rank{" "}
                      <strong className={entry.bestRank <= 3 ? "text-amber-400" : "text-slate-300"}>
                        #{entry.bestRank}
                      </strong>
                    </span>
                    <span>{entry.eventsScored} events</span>
                  </div>
                </div>
                <div className="divide-y divide-white/[0.04]">
                  {visible
                    .map((r) => (
                      <div key={r.eventId} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <Link
                              to={`/event/${r.eventId}`}
                              className="font-semibold text-slate-100 hover:text-blue-300 transition-colors text-sm"
                            >
                              {r.eventName}
                            </Link>
                            <div className="text-xs text-slate-600 mt-0.5">
                              {r.eventDate}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 text-xs">
                            <span className={`font-semibold tabular-nums ${r.teamRank <= 3 ? "text-amber-400" : "text-slate-300"}`}>
                              #{r.teamRank}
                            </span>
                            <span className="text-slate-600">
                              {r.basePoints}×{r.coefficient}
                            </span>
                            <span className="font-bold text-blue-300 bg-blue-500/15 px-2 py-0.5 rounded border border-blue-500/20">
                              +{r.points}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1 sm:gap-1.5">
                          {r.athletes
                            .filter((a) => a.scoring)
                            .map((a, i) =>
                              a.id ? (
                                <Link
                                  key={i}
                                  to={`/athlete/${a.id}`}
                                  className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium transition-colors hover:bg-white/10 ${i === 0 ? "bg-amber-500/15 text-amber-400" : i === 1 ? "bg-white/[0.06] text-slate-400" : "bg-orange-500/15 text-orange-400"}`}
                                >
                                  <span className="opacity-60">#{a.pos}</span>{" "}
                                  {a.name}
                                </Link>
                              ) : (
                                <span
                                  key={i}
                                  className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${i === 0 ? "bg-amber-500/15 text-amber-400" : i === 1 ? "bg-white/[0.06] text-slate-400" : "bg-orange-500/15 text-orange-400"}`}
                                >
                                  <span className="opacity-60">#{a.pos}</span>{" "}
                                  {a.name}
                                </span>
                              ),
                            )}
                        </div>
                      </div>
                    ))}
                </div>
                {hasMore && (
                  <button
                    onClick={() => setExpandedDists((prev) => {
                      const next = new Set(prev);
                      isExpanded ? next.delete(distKey) : next.add(distKey);
                      return next;
                    })}
                    className="w-full px-4 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-300 border-t border-white/[0.06] transition-colors text-center"
                  >
                    {isExpanded ? `Show less` : `Show all ${sorted.length} events`}
                  </button>
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Non-qualifying participations for selected season */}
      {nonQualifyingEvents.length > 0 && (
        <div className="mb-8">
          <div className="rounded-2xl border border-white/[0.07] overflow-hidden bg-[#0c1628]">
            <div className="flex items-center justify-between px-4 py-3 bg-[#060d1a] border-b border-white/[0.06]">
              <span className="text-xs text-slate-600 font-medium">
                No team ranking — fewer than 3 members per event
              </span>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {(() => {
                const grouped = new Map<
                  number,
                  { eventName: string; eventDate: string; distances: string[] }
                >();
                for (const ev of nonQualifyingEvents) {
                  const existing = grouped.get(ev.eventId);
                  if (existing) {
                    if (!existing.distances.includes(ev.distance)) {
                      existing.distances.push(ev.distance);
                    }
                  } else {
                    grouped.set(ev.eventId, {
                      eventName: ev.eventName,
                      eventDate: ev.eventDate,
                      distances: [ev.distance],
                    });
                  }
                }

                return [...grouped.entries()].map(([eventId, group]) => {
                  group.distances.sort(
                    (a, b) =>
                      (DISTANCES.indexOf(a) + 1 || 99) -
                      (DISTANCES.indexOf(b) + 1 || 99),
                  );
                  return (
                    <div
                      key={eventId}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 py-3 gap-1 sm:gap-3"
                    >
                      <div className="min-w-0">
                        <Link
                          to={`/event/${eventId}`}
                          className="font-semibold text-slate-100 hover:text-blue-300 transition-colors text-sm"
                        >
                          {group.eventName}
                        </Link>
                        <div className="text-xs text-slate-600 mt-0.5">
                          {group.eventDate}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 sm:shrink-0">
                        {group.distances.map((d) => (
                          <span
                            key={d}
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${distBadgeClass(d)}`}
                          >
                            {d}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
