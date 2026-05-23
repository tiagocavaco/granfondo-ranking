import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@granfondo/api";
import type { AthleteEntry, AthleteResultRef } from "@granfondo/database/types";
import { Spinner } from "../shared/Spinner";
import {
  countryFlag,
  SOLO_TEAM_KEYS,
  normalizeTeam,
} from "@granfondo/database/normalize";
import PerformanceChart from "./PerformanceChart";
import CareerHighlights from "./CareerHighlights";
import { distBadgeClass } from "../../utils/distance";
import { resolveTeamId, mostRecentCountry } from "@granfondo/api";
import { posStyle } from "../../utils/posStyle";
import { Stat } from "../shared/Stat";

export default function AthleteProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<AthleteEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const numId = Number(id);
    if (!id || !numId) {
      return;
    }

    setLoading(true);
    setData(null);
    setError(null);
    api
      .getAthlete(numId)
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <Spinner />;
  }

  if (error || !data) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p className="text-5xl mb-3">👤</p>
        <p className="font-semibold text-slate-600 text-lg">
          Athlete not found
        </p>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 text-sm text-blue-600 hover:underline"
        >
          ← Go back
        </button>
      </div>
    );
  }

  const athlete = data;

  const finished = athlete.results.filter((r) => !r.dnf && !r.dns);
  const podiums = finished.filter(
    (r) => r.genderPos > 0 && r.genderPos <= 3,
  ).length;
  const bestPos =
    finished.length > 0 ? Math.min(...finished.map((r) => r.pos)) : null;
  const recentTeam = athlete.canonicalTeam ?? athlete.results[0]?.team ?? "";
  const gender = athlete.results[0]?.gender ?? "";
  const country = mostRecentCountry(athlete.results);
  const sorted = [...athlete.results].sort((a, b) =>
    a.eventDate.localeCompare(b.eventDate),
  );

  // Group by year for the breakdown
  const byYear = sorted.reduce<Record<number, AthleteResultRef[]>>((acc, r) => {
    (acc[r.eventYear] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div>
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-slate-400 hover:text-slate-600 transition-colors mb-4 inline-flex items-center gap-1"
      >
        ← Back
      </button>

      {/* Hero */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 rounded-2xl p-6 mb-8 text-white">
        {/* Top row: badges + compare */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded ${gender === "F" ? "bg-pink-500/30 text-pink-200" : "bg-blue-500/30 text-blue-200"}`}
            >
              {gender === "F" ? "Women" : "Men"}
            </span>
            {country && (
              <span className="text-sm" title={country}>
                {countryFlag(country)}
              </span>
            )}
          </div>
          <Link
            to={`/compare?a=${athlete.id}`}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-blue-200 hover:text-white border border-white/10 transition-colors"
          >
            Compare ↗
          </Link>
        </div>

        {/* Name/team + stats */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight mb-1">
              {athlete.name}
            </h1>
            {recentTeam &&
              !SOLO_TEAM_KEYS.has(normalizeTeam(recentTeam)) &&
              resolveTeamId(recentTeam) !== undefined && (
                <Link
                  to={`/team/${resolveTeamId(recentTeam)}`}
                  className="text-blue-300 hover:text-white text-sm block transition-colors"
                >
                  {recentTeam}
                </Link>
              )}
          </div>
          <div className="flex gap-3 sm:shrink-0">
            <Stat label="Races" value={athlete.results.length} />
            <Stat label="Podiums" value={podiums} highlight={podiums > 0} />
            {bestPos && (
              <Stat
                label="Best Pos"
                value={`#${bestPos}`}
                highlight={bestPos <= 3}
              />
            )}
          </div>
        </div>
      </div>

      <CareerHighlights results={athlete.results} />

      <PerformanceChart results={athlete.results} />

      {/* Results by year */}
      {Object.keys(byYear)
        .sort()
        .reverse()
        .map((year) => {
          const yearResults = byYear[Number(year)]!;
          const yearTeam = yearResults[yearResults.length - 1]?.team ?? "";
          return (
            <div key={year} className="mb-8">
              <h2 className="text-lg font-bold text-slate-800 mb-3 flex items-baseline gap-2">
                {year}
                {yearTeam &&
                  !SOLO_TEAM_KEYS.has(normalizeTeam(yearTeam)) &&
                  resolveTeamId(yearTeam) !== undefined && (
                    <Link
                      to={`/team/${resolveTeamId(yearTeam)}`}
                      className="text-sm font-normal text-slate-400 hover:text-blue-600 transition-colors"
                    >
                      {yearTeam}
                    </Link>
                  )}
              </h2>
              <div className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto bg-white">
                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    <col />
                    <col className="hidden sm:table-column w-32" />
                    <col className="hidden md:table-column w-32" />
                    <col className="w-12 sm:w-16" />
                    <col className="w-28" />
                    <col className="hidden sm:table-column w-28" />
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-50 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-100">
                      <th className="px-4 py-3 text-left">Event</th>
                      <th className="px-4 py-3 text-left hidden sm:table-cell">
                        Distance
                      </th>
                      <th className="px-4 py-3 text-left hidden md:table-cell">
                        Category
                      </th>
                      <th className="px-4 py-3 text-center">Pos</th>
                      <th className="px-4 py-3 text-right">Time</th>
                      <th className="px-4 py-3 text-right hidden sm:table-cell">
                        Gap
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {byYear[Number(year)]!.map((r) => (
                      <tr
                        key={`${r.eventId}-${r.distance}`}
                        className={`hover:bg-slate-50/60 transition-colors ${r.dnf || r.dns ? "opacity-40" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <Link
                            to={`/event/${r.eventId}`}
                            className="font-semibold text-slate-900 hover:text-blue-600 transition-colors"
                          >
                            {r.eventName}
                          </Link>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {r.eventDate}
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${distBadgeClass(r.distance)}`}
                          >
                            {r.distance}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs hidden md:table-cell">
                          <span className="text-slate-400">{r.category}</span>
                          {r.catPos > 0 && r.catPos <= 4 && (
                            <span className="ml-1">
                              {r.catPos === 1
                                ? "🥇"
                                : r.catPos === 2
                                  ? "🥈"
                                  : r.catPos === 3
                                    ? "🥉"
                                    : "🍫"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
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
              </div>
            </div>
          );
        })}
    </div>
  );
}

