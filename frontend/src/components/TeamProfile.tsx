import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../api";
import type { TeamRanking, TeamEntry } from "@granfondo/database/types";
import { Spinner } from "./EventList";

function rankBadge(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

const DIST_COLOR: Record<string, string> = {
  Granfondo:   "bg-blue-100 text-blue-700",
  Mediofondo:  "bg-violet-100 text-violet-700",
  Minifondo:   "bg-emerald-100 text-emerald-700",
  "Time Trial":"bg-amber-100 text-amber-700",
};

export default function TeamProfile() {
  const { teamName: encoded } = useParams<{ teamName: string }>();
  const navigate = useNavigate();
  const teamName = decodeURIComponent(encoded ?? "");

  const [data, setData] = useState<TeamRanking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getTeamRanking()
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const teamEntries = useMemo(() => {
    if (!data) return [];
    const entries: Array<{ year: string; distance: string; entry: TeamEntry }> = [];
    for (const [year, dists] of Object.entries(data)) {
      for (const [dist, teams] of Object.entries(dists)) {
        const entry = teams.find((t) => t.team === teamName);
        if (entry) entries.push({ year, distance: dist, entry });
      }
    }
    return entries.sort((a, b) => b.year.localeCompare(a.year) || a.distance.localeCompare(b.distance));
  }, [data, teamName]);

  const members = useMemo(() => {
    const map = new Map<number, { id: number; name: string; appearances: number }>();
    for (const { entry } of teamEntries) {
      for (const r of entry.results) {
        for (const a of r.athletes) {
          if (!a.id) continue;
          const existing = map.get(a.id);
          if (existing) existing.appearances++;
          else map.set(a.id, { id: a.id, name: a.name, appearances: 1 });
        }
      }
    }
    return [...map.values()].sort((a, b) => b.appearances - a.appearances);
  }, [teamEntries]);

  const bestRank = teamEntries.reduce((best, { entry }) => Math.min(best, entry.bestRank), Infinity);
  const totalEventsScored = teamEntries.reduce((sum, { entry }) => sum + entry.eventsScored, 0);
  const seasons = [...new Set(teamEntries.map((e) => e.year))].sort().reverse();

  const byYear = useMemo(() => {
    const map: Record<string, Array<{ distance: string; entry: TeamEntry }>> = {};
    for (const { year, distance, entry } of teamEntries) {
      (map[year] ??= []).push({ distance, entry });
    }
    return map;
  }, [teamEntries]);

  if (loading) return <Spinner />;

  if (error || !data || teamEntries.length === 0)
    return (
      <div className="text-center py-16 text-slate-400">
        <p className="text-5xl mb-3">🏅</p>
        <p className="font-semibold text-slate-600 text-lg">Team not found</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-sm text-blue-600 hover:underline">
          ← Go back
        </button>
      </div>
    );

  return (
    <div>
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
            <div className="text-blue-300 text-xs font-semibold uppercase tracking-widest mb-1">Team</div>
            <h1 className="text-3xl font-extrabold tracking-tight">{teamName}</h1>
            <p className="text-blue-300 text-sm mt-1">{seasons.join(" · ")}</p>
          </div>
          <div className="flex gap-4 flex-wrap">
            <Stat label="Events" value={totalEventsScored} />
            <Stat label="Seasons" value={seasons.length} />
            {isFinite(bestRank) && (
              <Stat label="Best Rank" value={rankBadge(bestRank)} highlight={bestRank <= 3} />
            )}
            {members.length > 0 && <Stat label="Members" value={members.length} />}
          </div>
        </div>
      </div>

      {/* Members */}
      {members.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-slate-800 mb-3">Members</h2>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <button
                key={m.id}
                onClick={() => navigate(`/athlete/${m.id}`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-sm font-medium text-slate-700 hover:border-blue-400 hover:text-blue-700 transition-colors shadow-sm"
              >
                {m.name}
                <span className="text-xs text-slate-400 font-normal">{m.appearances}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results by year */}
      {seasons.map((year) => (
        <div key={year} className="mb-8">
          <h2 className="text-lg font-bold text-slate-800 mb-3">{year}</h2>
          <div className="space-y-4">
            {byYear[year]!.map(({ distance, entry }) => (
              <div key={distance} className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden bg-white">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${DIST_COLOR[distance] ?? "bg-slate-100 text-slate-600"}`}>
                    {distance}
                  </span>
                  <div className="text-xs text-slate-500 flex gap-3">
                    <span>Best rank <strong className="text-slate-700">{rankBadge(entry.bestRank)}</strong></span>
                    <span>{entry.eventsScored} events</span>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {entry.results.sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()).map((r) => (
                    <div key={r.eventId} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <Link
                            to={`/event/${r.eventId}`}
                            className="font-semibold text-slate-900 hover:text-blue-600 transition-colors text-sm"
                          >
                            {r.eventName}
                          </Link>
                          <div className="text-xs text-slate-400 mt-0.5">{r.eventDate}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 text-xs">
                          <span className="font-semibold text-slate-700">{rankBadge(r.teamRank)}</span>
                          <span className="text-slate-400">{r.basePoints}×{r.coefficient}</span>
                          <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">+{r.points}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {r.athletes.map((a, i) => (
                          <button
                            key={i}
                            onClick={() => { if (a.id) navigate(`/athlete/${a.id}`); }}
                            className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium transition-colors ${
                              a.id ? "cursor-pointer hover:bg-blue-50 hover:text-blue-700" : "cursor-default"
                            } ${i === 0 ? "bg-amber-50 text-amber-700" : i === 1 ? "bg-slate-100 text-slate-600" : "bg-orange-50 text-orange-600"}`}
                          >
                            <span className="opacity-60">#{a.pos}</span> {a.name}
                          </button>
                        ))}
                        <span className="text-[11px] text-slate-400 self-center ml-1">
                          combined {r.combinedScore} · {r.eligibleTeams} teams eligible
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
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
