import { useEffect, useState, useMemo } from "react";
import { api } from "../api";
import type { StoredEvent } from "@granfondo/database/types";
import EventCard from "./EventCard";

type SeasonFilter = "all" | string;
type StatusFilter = "all" | "past" | "upcoming";

export default function EventList() {
  const [allEvents, setAllEvents] = useState<StoredEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<SeasonFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("past");
  const [stats, setStats] = useState<{
    uniqueAthletes: number;
    uniqueByYear: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    api
      .getEvents()
      .then(setAllEvents)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
    api
      .getStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  const seasons = useMemo(
    () => [
      "all",
      ...Array.from(new Set(allEvents.map((e) => String(e.year))))
        .sort()
        .reverse(),
    ],
    [allEvents],
  );

  const filtered = useMemo(() => {
    return allEvents
      .filter((e) => {
        const isPast = new Date(e.date + "T12:00:00") < new Date();
        const matchSeason = season === "all" || String(e.year) === season;
        const matchStatus =
          status === "all" ||
          (status === "past" && isPast) ||
          (status === "upcoming" && !isPast);
        return matchSeason && matchStatus;
      })
      .sort((a, b) => {
        const aDate = new Date(a.date).getTime();
        const bDate = new Date(b.date).getTime();
        const now = Date.now();
        const aPast = aDate < now;
        const bPast = bDate < now;
        // Past events: newest first. Upcoming events: soonest first.
        if (aPast && bPast) {
          return bDate - aDate;
        }

        if (!aPast && !bPast) {
          return aDate - bDate;
        }

        // Upcoming before past when showing "all"
        return aPast ? 1 : -1;
      });
  }, [allEvents, season, status]);

  const totalFinishers = useMemo(
    () =>
      filtered
        .filter((e) => e.hasResults)
        .reduce((s, e) => s + e.finisherCount, 0),
    [filtered],
  );

  return (
    <div>
      {/* Stats bar */}
      {!loading && !error && allEvents.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-8">
          {[
            { label: "Events", value: filtered.length, icon: "🏁" },
            {
              label: "With Results",
              value: filtered.filter((e) => e.hasResults).length,
              icon: "✅",
            },
            {
              label: "Finishers",
              value: totalFinishers.toLocaleString(),
              icon: "🚴",
              sub: stats
                ? (() => {
                    const count =
                      season !== "all"
                        ? stats.uniqueByYear[season]
                        : stats.uniqueAthletes;
                    const label =
                      season !== "all" ? "unique" : "unique all-time";
                    return count !== undefined
                      ? `${count.toLocaleString()} ${label}`
                      : undefined;
                  })()
                : undefined,
            },
          ].map(
            ({
              label,
              value,
              icon,
              sub,
            }: {
              label: string;
              value: string | number;
              icon: string;
              sub?: string;
            }) => (
              <div
                key={label}
                className="bg-white rounded-2xl border border-slate-200 px-3 sm:px-5 py-3 sm:py-4 text-center"
              >
                <div className="text-xl sm:text-2xl mb-0.5 sm:mb-1">{icon}</div>
                <div className="text-lg sm:text-2xl font-extrabold text-slate-900 leading-tight">
                  {value}
                  {sub && (
                    <span className="hidden sm:inline text-sm font-medium text-slate-400 ml-1">
                      ({sub})
                    </span>
                  )}
                </div>
                <div className="text-[10px] sm:text-xs text-slate-500 font-medium mt-0.5">
                  {label}
                </div>
              </div>
            ),
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 mb-6">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">
            Season
          </span>
          <select
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="flex-1 sm:flex-none px-3.5 py-1.5 text-sm font-semibold border border-slate-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-600"
          >
            {seasons.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All seasons" : s}
              </option>
            ))}
          </select>
        </div>
        <FilterGroup
          label="Status"
          options={["all", "past", "upcoming"]}
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
          format={(s) => s.charAt(0).toUpperCase() + s.slice(1)}
        />
      </div>

      {loading && <Spinner />}
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {!loading && !error && (
        <>
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <p className="text-4xl mb-3">🏜️</p>
              <p className="font-semibold text-slate-600">No events found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
  format = (v) => v,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  format?: (v: string) => string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">
        {label}
      </span>
      <div className="flex flex-1 sm:flex-none rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 text-sm font-semibold transition-all ${
              value === o
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {format(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="animate-spin rounded-full h-8 w-8 border-[3px] border-slate-200 border-t-blue-600" />
    </div>
  );
}

export function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
      {children}
    </div>
  );
}
