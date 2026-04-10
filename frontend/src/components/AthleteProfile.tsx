import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../api";
import type { AthleteEntry, AthleteResultRef, AthleteDisambiguation } from "../types";
import { Spinner } from "./EventList";

const DIST_COLOR: Record<string, string> = {
  Granfondo: "bg-blue-50 text-blue-700",
  GranFondo: "bg-blue-50 text-blue-700",
  "BIG DAY": "bg-blue-50 text-blue-700",
  "Clássica": "bg-blue-50 text-blue-700",
  Mediofondo: "bg-violet-50 text-violet-700",
  "HALF DAY": "bg-violet-50 text-violet-700",
  Etapa: "bg-violet-50 text-violet-700",
  Minifondo: "bg-emerald-50 text-emerald-700",
  "Time Trial": "bg-amber-50 text-amber-700",
  "TIME TRIAL": "bg-amber-50 text-amber-700",
};

function posStyle(pos: number) {
  if (pos === 1) return "bg-gradient-to-br from-yellow-400 to-amber-500 text-white shadow-sm";
  if (pos === 2) return "bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow-sm";
  if (pos === 3) return "bg-gradient-to-br from-orange-400 to-orange-500 text-white shadow-sm";
  if (pos <= 10) return "bg-blue-50 text-blue-700 font-semibold";
  return "bg-slate-100 text-slate-500";
}

export default function AthleteProfile() {
  const { nameLower } = useParams<{ nameLower: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<AthleteEntry | AthleteDisambiguation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!nameLower) return;
    setLoading(true);
    setData(null);
    setError(null);
    api
      .getAthlete(nameLower)
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [nameLower]);

  if (loading) return <Spinner />;

  if (error || !data)
    return (
      <div className="text-center py-16 text-slate-400">
        <p className="text-5xl mb-3">👤</p>
        <p className="font-semibold text-slate-600 text-lg">Athlete not found</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-sm text-blue-600 hover:underline">
          ← Go back
        </button>
      </div>
    );

  if ("disambiguation" in data) {
    return (
      <div>
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-6 transition-colors"
        >
          ← Back
        </button>
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Multiple athletes found
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Several athletes share this name. Select the correct profile:
          </p>
        </div>
        <div className="grid gap-3 max-w-lg">
          {data.matches.map((m) => (
            <button
              key={m.slug}
              onClick={() => navigate(`/athlete/${m.slug}`)}
              className="text-left rounded-xl border border-slate-200 bg-white px-5 py-4 hover:border-blue-300 hover:bg-blue-50/40 transition-colors shadow-sm"
            >
              <div className="font-semibold text-slate-900">{m.name}</div>
              <div className="text-sm text-slate-500 mt-0.5">
                {m.team || "No team"} · {m.resultCount} race{m.resultCount !== 1 ? "s" : ""}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const athlete = data;

  const finished = athlete.results.filter((r) => !r.dnf && !r.dns);
  const bestPos = finished.length > 0 ? Math.min(...finished.map((r) => r.pos)) : null;
  const recentTeam = athlete.canonicalTeam ?? athlete.results[0]?.team ?? "";
  const gender = athlete.results[0]?.gender ?? "";
  const country = athlete.results[0]?.country ?? "";
  const sorted = [...athlete.results].sort((a, b) => a.eventDate.localeCompare(b.eventDate));

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
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-6 transition-colors"
      >
        ← Back
      </button>

      {/* Hero */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 rounded-2xl p-6 mb-8 text-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded ${gender === "F" ? "bg-pink-500/30 text-pink-200" : "bg-blue-500/30 text-blue-200"}`}>
                {gender === "F" ? "Women" : "Men"}
              </span>
              {country && <span className="text-xs text-blue-300">{country}</span>}
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">{athlete.name}</h1>
            {recentTeam && recentTeam !== "Individual" && (
              <p className="text-blue-300 text-sm mt-1">{recentTeam}</p>
            )}
          </div>
          <div className="flex gap-4 flex-wrap">
            <Stat label="Races" value={athlete.results.length} />
            <Stat label="Finishes" value={finished.length} />
            {bestPos && <Stat label="Best Pos" value={`#${bestPos}`} highlight={bestPos <= 3} />}
          </div>
        </div>
      </div>

      {/* Results by year */}
      {Object.keys(byYear).sort().reverse().map((year) => {
        const yearResults = byYear[Number(year)]!;
        const yearTeam = yearResults[yearResults.length - 1]?.team ?? "";
        return (
        <div key={year} className="mb-8">
          <h2 className="text-lg font-bold text-slate-800 mb-3 flex items-baseline gap-2">
            {year}
            {yearTeam && yearTeam !== "Individual" && (
              <span className="text-sm font-normal text-slate-400">{yearTeam}</span>
            )}
          </h2>
          <div className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-4 py-3 text-left">Event</th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">Distance</th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">Category</th>
                  <th className="px-4 py-3 text-center w-16">Pos</th>
                  <th className="px-4 py-3 text-right">Time</th>
                  <th className="px-4 py-3 text-right hidden sm:table-cell">Gap</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byYear[Number(year)]!.map((r) => (
                  <tr key={`${r.eventId}-${r.distance}`} className={`hover:bg-slate-50/60 transition-colors ${r.dnf || r.dns ? "opacity-40" : ""}`}>
                    <td className="px-4 py-3">
                      <Link
                        to={`/event/${r.eventId}`}
                        className="font-semibold text-slate-900 hover:text-blue-600 transition-colors"
                      >
                        {r.eventName}
                      </Link>
                      <div className="text-xs text-slate-400 mt-0.5">{r.eventDate}</div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${DIST_COLOR[r.distance] ?? "bg-slate-100 text-slate-600"}`}>
                        {r.distance}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs hidden md:table-cell">{r.category}</td>
                    <td className="px-4 py-3 text-center">
                      {r.dnf || r.dns ? (
                        <span className="text-xs text-slate-400 font-bold">{r.dnf ? "DNF" : "DNS"}</span>
                      ) : (
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold ${posStyle(r.pos)}`}>
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

function Stat({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="text-center bg-white/10 rounded-xl px-4 py-2 border border-white/10">
      <div className={`text-xl font-extrabold ${highlight ? "text-amber-400" : "text-white"}`}>{value}</div>
      <div className="text-xs text-blue-300 font-medium mt-0.5">{label}</div>
    </div>
  );
}
