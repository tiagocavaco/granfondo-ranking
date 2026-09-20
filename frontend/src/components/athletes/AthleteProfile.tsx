import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@granfondo/api";
import type { AthleteEntry, AthleteResultRef } from "@granfondo/database/types";
import { Spinner } from "../shared/Spinner";
import { CatPosBadge } from "../shared/MedalBadge";
import {
  countryFlag,
  SOLO_TEAM_KEYS,
  normalizeTeam,
} from "@granfondo/database/normalize";
import PerformanceChart from "./PerformanceChart";
import CareerHighlights from "./CareerHighlights";
import { distBadgeClass } from "../../utils/distance";
import { resolveTeamId, mostRecentCountry } from "@granfondo/api";
import { posStyle, rankTextColor } from "../../utils/posStyle";
import { BackButton } from "../shared/BackButton";
import { NotFoundState, ghostButtonClass } from "../shared/NotFoundState";
import { GenderBadge } from "../shared/GenderBadge";
import { usePageTitle } from "../../hooks/usePageTitle";

export default function AthleteProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<AthleteEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  usePageTitle(data?.name);

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
      <NotFoundState
        label="Athlete not found"
        description="This athlete doesn't exist or may have been removed."
        action={
          <Link to="/athletes" className={ghostButtonClass}>
            ← Athletes
          </Link>
        }
      />
    );
  }

  const athlete = data;

  const finished = athlete.results.filter((r) => !r.dnf && !r.dns);
  const overallPodiums = finished.filter(
    (r) => r.genderPos > 0 && r.genderPos <= 3,
  ).length;
  const catPodiums = finished.filter(
    (r) => r.catPos > 0 && r.catPos <= 3,
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
      <BackButton />

      {/* Hero */}
      <div className="animate-scale relative bg-[#0c1628] rounded-2xl p-6 sm:p-8 mb-8 text-white overflow-hidden border border-white/[0.07]">
        {/* Top accent line — gender-coded */}
        <div
          className={`absolute inset-x-0 top-0 h-[2px] ${
            gender === "F"
              ? "bg-gradient-to-r from-pink-400/0 via-pink-400/70 to-pink-400/0"
              : "bg-gradient-to-r from-blue-400/0 via-blue-400/50 to-blue-400/0"
          }`}
        />
        {/* Ghost initial watermark */}
        <div className="absolute right-0 top-0 bottom-0 flex items-center pr-4 select-none pointer-events-none opacity-[0.04]">
          <div className="text-[180px] sm:text-[220px] font-black text-white leading-none">
            {athlete.name.charAt(0)}
          </div>
        </div>

        <div className="relative">
          {/* Top row: gender + flag + compare */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <GenderBadge gender={gender} variant="hero" />
              {country && (
                <span className="text-sm" title={country}>
                  {countryFlag(country)}
                </span>
              )}
            </div>
            <Link
              to={`/compare?a=${athlete.id}`}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/[0.06] text-slate-300 border border-white/[0.08] hover:bg-white/[0.12] hover:text-white transition-colors"
            >
              Compare ↗
            </Link>
          </div>

          {/* Name */}
          <h1 className="font-display font-bold text-4xl sm:text-5xl tracking-wide mb-1 leading-none uppercase">
            {athlete.name}
          </h1>

          {/* Team */}
          {recentTeam &&
            !SOLO_TEAM_KEYS.has(normalizeTeam(recentTeam)) &&
            resolveTeamId(recentTeam) !== undefined && (
              <Link
                to={`/team/${resolveTeamId(recentTeam)}`}
                className="text-slate-500 hover:text-blue-300 text-sm block transition-colors mt-1"
              >
                {recentTeam}
              </Link>
            )}

          {/* Editorial stats strip */}
          <div className="flex items-stretch mt-5 pt-5 border-t border-white/[0.06]">
            <div className="flex flex-col items-center pr-3 sm:pr-5">
              <span className="text-2xl sm:text-3xl font-black tabular-nums text-white leading-none">
                {athlete.results.length}
              </span>
              <span className="text-[9px] sm:text-[10px] text-slate-600 font-bold uppercase tracking-widest mt-1 whitespace-nowrap">
                Races
              </span>
            </div>
            <div className="w-[1px] self-stretch bg-white/[0.08] shrink-0" />
            <div className="flex flex-col items-center px-3 sm:px-5">
              <span
                className={`text-2xl sm:text-3xl font-black tabular-nums leading-none ${overallPodiums > 0 ? "text-amber-400" : "text-slate-500"}`}
              >
                {overallPodiums}
              </span>
              <span className="text-[9px] sm:text-[10px] text-slate-600 font-bold uppercase tracking-widest mt-1 whitespace-nowrap">
                Podiums
              </span>
            </div>
            <div className="w-[1px] self-stretch bg-white/[0.08] shrink-0" />
            <div className="flex flex-col items-center px-3 sm:px-5">
              <span
                className={`text-2xl sm:text-3xl font-black tabular-nums leading-none ${catPodiums > 0 ? "text-amber-400" : "text-slate-500"}`}
              >
                {catPodiums}
              </span>
              <span className="text-[9px] sm:text-[10px] text-slate-600 font-bold uppercase tracking-widest mt-1 whitespace-nowrap">
                Cat Podiums
              </span>
            </div>
            {bestPos && (
              <>
                <div className="w-[1px] self-stretch bg-white/[0.08] shrink-0" />
                <div className="flex flex-col items-center pl-3 sm:pl-5">
                  <span
                    className={`text-2xl sm:text-3xl font-black tabular-nums leading-none ${rankTextColor(bestPos, "text-white")}`}
                  >
                    #{bestPos}
                  </span>
                  <span className="text-[9px] sm:text-[10px] text-slate-600 font-bold uppercase tracking-widest mt-1 whitespace-nowrap">
                    Best
                  </span>
                </div>
              </>
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
              <div className="flex items-center gap-4 mb-3">
                <span className="text-4xl font-black text-white/[0.07] tabular-nums select-none leading-none">
                  {year}
                </span>
                <div className="flex-1 h-[1px] bg-gradient-to-r from-white/[0.08] to-transparent" />
                {yearTeam &&
                  !SOLO_TEAM_KEYS.has(normalizeTeam(yearTeam)) &&
                  resolveTeamId(yearTeam) !== undefined && (
                    <Link
                      to={`/team/${resolveTeamId(yearTeam)}`}
                      className="text-[10px] font-bold text-slate-600 uppercase tracking-widest hover:text-blue-400 transition-colors whitespace-nowrap"
                    >
                      {yearTeam}
                    </Link>
                  )}
              </div>
              <div className="rounded-2xl border border-white/[0.07] overflow-hidden overflow-x-auto bg-[#0c1628]">
                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    <col />
                    <col className="hidden sm:table-column w-32" />
                    <col className="hidden md:table-column w-32" />
                    <col className="w-12 sm:w-16" />
                    <col className="w-28" />
                    <col className="hidden lg:table-column w-28" />
                  </colgroup>
                  <thead>
                    <tr className="bg-[#060d1a] text-xs text-slate-500 uppercase tracking-wider border-b border-white/[0.06]">
                      <th className="px-4 py-3 text-left">Event</th>
                      <th className="px-4 py-3 text-left hidden sm:table-cell">
                        Distance
                      </th>
                      <th className="px-4 py-3 text-left hidden md:table-cell">
                        Category
                      </th>
                      <th className="px-4 py-3 text-center">Pos</th>
                      <th className="px-4 py-3 text-right">Time</th>
                      <th className="px-4 py-3 text-right hidden lg:table-cell">
                        Gap
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {byYear[Number(year)]!.map((r) => (
                      <tr
                        key={`${r.eventId}-${r.distance}`}
                        className={`hover:bg-white/[0.03] transition-colors ${r.dnf || r.dns ? "opacity-40" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <Link
                            to={`/event/${r.eventId}`}
                            className="font-semibold text-slate-100 hover:text-blue-300 transition-colors"
                          >
                            {r.eventName}
                          </Link>
                          <div className="text-xs text-slate-600 mt-0.5">
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
                          <span className="text-slate-500">{r.category}</span>
                          {r.catPos > 0 && (
                            <span className="ml-1">
                              <CatPosBadge pos={r.catPos} />
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {r.dnf || r.dns ? (
                            <span className="text-xs text-slate-500 font-bold">
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
                        <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-slate-300">
                          {r.raceTime}
                          {r.gap && r.gap !== "00:00:00" && (
                            <div className="font-mono text-xs text-slate-600 mt-0.5 lg:hidden">
                              {r.gap}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-slate-600 hidden lg:table-cell">
                          {r.gap && r.gap !== "00:00:00" ? r.gap : "—"}
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
