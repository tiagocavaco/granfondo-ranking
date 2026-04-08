import { useEffect, useState, useMemo } from "react";
import { api } from "../api";
import type { StoredEvent } from "../types";
import EventCard from "./EventCard";

type SeasonFilter = "all" | string;
type StatusFilter = "all" | "past" | "upcoming";

export default function EventList() {
  const [allEvents, setAllEvents] = useState<StoredEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<SeasonFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("past");

  useEffect(() => {
    api
      .getEvents()
      .then(setAllEvents)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const seasons = useMemo(
    () => ["all", ...Array.from(new Set(allEvents.map((e) => String(e.year)))).sort().reverse()],
    [allEvents]
  );

  const filtered = useMemo(() => {
    return allEvents.filter((e) => {
      const isPast = new Date(e.date + "T00:00:00") < new Date();
      const matchSeason = season === "all" || String(e.year) === season;
      const matchStatus =
        status === "all" ||
        (status === "past" && isPast) ||
        (status === "upcoming" && !isPast);
      return matchSeason && matchStatus;
    });
  }, [allEvents, season, status]);

  const totalFinishers = useMemo(
    () => filtered.filter((e) => e.hasResults).reduce((s, e) => s + e.finisherCount, 0),
    [filtered]
  );

  return (
    <div>
      {/* Stats bar */}
      {!loading && !error && allEvents.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-8">
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
            },
          ].map(({ label, value, icon }) => (
            <div
              key={label}
              className="bg-white rounded-2xl border border-slate-200 px-5 py-4 text-center"
            >
              <div className="text-2xl mb-1">{icon}</div>
              <div className="text-2xl font-extrabold text-slate-900">{value}</div>
              <div className="text-xs text-slate-500 font-medium mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <FilterGroup
          label="Season"
          options={seasons}
          value={season}
          onChange={setSeason}
          format={(s) => (s === "all" ? "All" : s)}
        />
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
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={`px-3.5 py-1.5 text-sm font-semibold transition-all ${
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
