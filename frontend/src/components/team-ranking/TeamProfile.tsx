import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@granfondo/api";
import type { TeamRanking, TeamEntry } from "@granfondo/database/types";
import { Spinner } from "../shared/Spinner";
import { distBadgeClass } from "../../utils/distance";
import { DISTANCES } from "@granfondo/utils/distance";
import { TeamMemberList } from "./TeamMemberList";
import { Stat } from "../shared/Stat";
import { rankLabel } from "../../utils/rankLabel";


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
        <p className="text-5xl mb-3">🏅</p>
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
          <p className="text-5xl mb-3">🏅</p>
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
        className="text-sm text-slate-400 hover:text-slate-600 transition-colors mb-4 inline-flex items-center gap-1"
      >
        ← Back
      </button>

      {/* Hero */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 rounded-2xl p-6 mb-8 text-white">
        <div className="mb-3">
          <div className="text-blue-300 text-xs font-semibold uppercase tracking-widest">
            Team
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1 break-words">
              {displayName}
            </h1>
            <p className="text-blue-300 text-sm">{allSeasons.join(" · ")}</p>
          </div>
          <div className="flex gap-3 sm:shrink-0">
            <Stat label="Seasons" value={allSeasons.length} />
            {effectiveTotalMembers > 0 && (
              <Stat label="Members" value={effectiveTotalMembers} />
            )}
            {effectiveTotalEvents > 0 && (
              <Stat label="Events" value={effectiveTotalEvents} />
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
            className="sm:hidden flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-600 font-semibold"
          >
            {allSeasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {/* Desktop: segmented pill toggle */}
          <div className="hidden sm:flex rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
            {allSeasons.map((s) => (
              <button
                key={s}
                onClick={() => setSelectedSeason(s)}
                className={`px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition-all ${
                  effectiveSeason === s
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 hover:bg-slate-50"
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
        <h2 className="text-lg font-bold text-slate-800 mb-3">Results</h2>
      )}
      {seasonEntries.length > 0 && (
        <div className="mb-8">
          <div className="space-y-4">
            {seasonEntries.map(({ distance, entry }) => (
              <div
                key={distance}
                className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto bg-white"
              >
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full ${distBadgeClass(distance)}`}
                  >
                    {distance}
                  </span>
                  <div className="text-xs text-slate-500 flex gap-3">
                    <span>
                      Best rank{" "}
                      <strong className="text-slate-700">
                        {rankLabel(entry.bestRank)}
                      </strong>
                    </span>
                    <span>{entry.eventsScored} events</span>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {entry.results
                    .sort(
                      (a, b) =>
                        new Date(b.eventDate).getTime() -
                        new Date(a.eventDate).getTime(),
                    )
                    .map((r) => (
                      <div key={r.eventId} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <Link
                              to={`/event/${r.eventId}`}
                              className="font-semibold text-slate-900 hover:text-blue-600 transition-colors text-sm"
                            >
                              {r.eventName}
                            </Link>
                            <div className="text-xs text-slate-400 mt-0.5">
                              {r.eventDate}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 text-xs">
                            <span className="font-semibold text-slate-700">
                              {rankLabel(r.teamRank)}
                            </span>
                            <span className="text-slate-400">
                              {r.basePoints}×{r.coefficient}
                            </span>
                            <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
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
                                  className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium transition-colors hover:bg-blue-50 hover:text-blue-700 ${i === 0 ? "bg-amber-50 text-amber-700" : i === 1 ? "bg-slate-100 text-slate-600" : "bg-orange-50 text-orange-600"}`}
                                >
                                  <span className="opacity-60">#{a.pos}</span>{" "}
                                  {a.name}
                                </Link>
                              ) : (
                                <span
                                  key={i}
                                  className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${i === 0 ? "bg-amber-50 text-amber-700" : i === 1 ? "bg-slate-100 text-slate-600" : "bg-orange-50 text-orange-600"}`}
                                >
                                  <span className="opacity-60">#{a.pos}</span>{" "}
                                  {a.name}
                                </span>
                              )
                            )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Non-qualifying participations for selected season */}
      {nonQualifyingEvents.length > 0 && (
        <div className="mb-8">
          <div className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden bg-white">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
              <span className="text-xs text-slate-400 font-medium">
                No team ranking — fewer than 3 members per event
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {(() => {
                const grouped = new Map<
                  number,
                  { eventName: string; eventDate: string; distances: string[] }
                >();
                for (const ev of nonQualifyingEvents) {
                  const g = grouped.get(ev.eventId);
                  if (g) {
                    if (!g.distances.includes(ev.distance)) {
                      g.distances.push(ev.distance);
                    }
                  } else {
                    grouped.set(ev.eventId, {
                      eventName: ev.eventName,
                      eventDate: ev.eventDate,
                      distances: [ev.distance],
                    });
                  }
                }

                return [...grouped.entries()].map(([eventId, g]) => {
                  g.distances.sort(
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
                          className="font-semibold text-slate-900 hover:text-blue-600 transition-colors text-sm"
                        >
                          {g.eventName}
                        </Link>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {g.eventDate}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 sm:shrink-0">
                        {g.distances.map((d) => (
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

