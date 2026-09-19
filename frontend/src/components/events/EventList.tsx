import React, { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@granfondo/api";
import type { StoredEvent } from "@granfondo/database/types";
import { normalizeName } from "@granfondo/database/normalize";
import { Spinner, ErrorBanner } from "../shared/Spinner";
import { distBadgeClass } from "../../utils/distance";
import { ShieldCheckIcon } from "../shared/ShieldCheckIcon";

type SeasonFilter = "all" | string;
type StatusFilter = "all" | "past" | "upcoming";

export default function EventList() {
  const [allEvents, setAllEvents] = useState<StoredEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<SeasonFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("past");
  const [query, setQuery] = useState("");
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

  const nextUpcoming = useMemo(() => {
    const now = Date.now();
    return (
      allEvents
        .filter((e) => new Date(e.date + "T12:00:00").getTime() >= now)
        .sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        )[0] ?? null
    );
  }, [allEvents]);

  const filtered = useMemo(() => {
    const q = normalizeName(query);
    return allEvents
      .filter((e) => {
        const isPast = new Date(e.date + "T12:00:00") < new Date();
        const matchSeason = season === "all" || String(e.year) === season;
        const matchStatus =
          status === "all" ||
          (status === "past" && isPast) ||
          (status === "upcoming" && !isPast);
        const matchQuery =
          !q ||
          normalizeName(e.name).includes(q) ||
          normalizeName(e.location ?? "").includes(q);
        return matchSeason && matchStatus && matchQuery;
      })
      .sort((a, b) => {
        const aDate = new Date(a.date).getTime();
        const bDate = new Date(b.date).getTime();
        const now = Date.now();
        const aPast = aDate < now;
        const bPast = bDate < now;
        if (aPast && bPast) {
          return bDate - aDate;
        }

        if (!aPast && !bPast) {
          return aDate - bDate;
        }

        return aPast ? 1 : -1;
      });
  }, [allEvents, season, status, query]);

  const totalFinishers = useMemo(
    () =>
      filtered
        .filter((e) => e.hasResults)
        .reduce((s, e) => s + e.finisherCount, 0),
    [filtered],
  );

  const uniqueAthleteCount =
    season !== "all" ? stats?.uniqueByYear[season] : stats?.uniqueAthletes;

  return (
    <div>
      {/* Page editorial header */}
      {!loading && !error && (
        <div className="mb-6">
          <div className="text-[10px] font-black tracking-[0.3em] text-blue-500/70 uppercase mb-1">
            Portuguese Granfondo Series
          </div>
          <h1 className="font-display font-bold text-5xl sm:text-7xl text-white tracking-wide uppercase leading-none">
            Race Events<span className="text-blue-400">.</span>
          </h1>
        </div>
      )}

      {/* Next upcoming event hero */}
      {!loading && !error && nextUpcoming && <EventHero event={nextUpcoming} />}

      {/* Stats strip */}
      {!loading && !error && allEvents.length > 0 && (
        <div className="flex items-center gap-3 sm:gap-6 mb-8 px-1 border-t border-white/[0.06] pt-6">
          <StatPill value={filtered.length} label="events" color="text-white" />
          <div className="w-[1px] h-6 bg-white/[0.07]" />
          <StatPill
            value={filtered.filter((e) => e.hasResults).length}
            label={
              <>
                <span className="sm:hidden">w/ results</span>
                <span className="hidden sm:inline">with results</span>
              </>
            }
            color="text-amber-400"
          />
          <div className="w-[1px] h-6 bg-white/[0.07]" />
          <StatPill
            value={totalFinishers.toLocaleString()}
            label="finishers"
            color="text-amber-300"
          />
          {uniqueAthleteCount !== undefined && (
            <>
              <div className="w-[1px] h-6 bg-white/[0.07] hidden sm:block" />
              <StatPill
                value={uniqueAthleteCount.toLocaleString()}
                label="unique athletes"
                color="text-slate-300"
                className="hidden sm:flex"
              />
            </>
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
            className="flex-1 sm:flex-none px-3.5 py-1.5 text-sm font-semibold rounded-xl input-dark focus:outline-none"
          >
            {seasons.map((s) => (
              <option key={s} value={s} className="bg-[#0c1628]">
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
        <input
          type="search"
          placeholder="Search events…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full sm:w-52 sm:ml-auto px-3.5 py-2 text-sm rounded-xl input-dark focus:outline-none"
        />
      </div>

      {loading && <Spinner />}
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {!loading && !error && (
        <>
          {filtered.length === 0 ? (
            <div className="text-center py-20 text-slate-600">
              <svg
                className="w-10 h-10 mx-auto mb-3 text-slate-700"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
              <p className="font-semibold text-slate-500">No events found</p>
            </div>
          ) : (
            /* Past (or all): editorial list grouped by year */
            <EventListByYear events={filtered} />
          )}
        </>
      )}
    </div>
  );
}

function EventHero({ event }: { event: StoredEvent }) {
  const navigate = useNavigate();
  const date = new Date(event.date + "T12:00:00");
  const day = date.toLocaleDateString("en-GB", { day: "numeric" });
  const month = date
    .toLocaleDateString("en-GB", { month: "short" })
    .toUpperCase();
  const year = date.getFullYear();
  const fullDate = date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const daysUntil = Math.ceil(
    (date.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );

  return (
    <div
      onClick={() => navigate(`/event/${event.id}`)}
      className="block mb-8 group cursor-pointer"
    >
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0a1628] via-[#0d1d3a] to-[#0a1628] border border-white/[0.08] hover:border-white/[0.14] transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/10">
        {/* Ambient glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Top accent */}
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent" />

        <div className="relative p-6 sm:p-8 md:p-10">
          {/* Label row — full card width so ml-auto reaches the card edge */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[11px] font-black tracking-[0.25em] text-amber-400 uppercase">
                Next Race
              </span>
            </div>
            {daysUntil > 0 && (
              <span className="text-[11px] font-bold tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/25 px-2 py-0.5 rounded-full">
                {daysUntil === 1 ? "Tomorrow" : `${daysUntil} days`}
              </span>
            )}
            <div className="hidden sm:flex items-center gap-2 ml-auto">
              {event.participantCount > 0 && (
                <Link
                  to={`/event/${event.id}/predictions`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-400/10 text-amber-300 border border-amber-400/20 hover:bg-amber-400/20 transition-colors"
                >
                  Predictions ✦
                </Link>
              )}
              {event.officialUrl && (
                <a
                  href={event.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 border border-white/[0.1] hover:text-white hover:border-white/25 transition-colors"
                >
                  <ShieldCheckIcon />
                  Official Page ↗
                </a>
              )}
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1 min-w-0">
              {/* Event name */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <h2 className="font-display font-bold text-3xl sm:text-4xl md:text-5xl text-white leading-tight tracking-wide uppercase group-hover:text-amber-100 transition-colors">
                  {event.name}
                </h2>
                <div className="md:hidden shrink-0 text-right select-none pt-1 opacity-20">
                  <div className="text-[38px] font-black text-white leading-none tabular-nums">
                    {day}
                  </div>
                  <div className="text-[11px] font-black text-amber-400 tracking-widest mt-0.5">
                    {month}
                  </div>
                  <div className="text-[9px] font-bold text-slate-400 mt-0.5">
                    {year}
                  </div>
                </div>
              </div>

              {/* Date row — visible and bold on mobile */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4">
                <span className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                  <svg
                    className="w-3.5 h-3.5 text-slate-500 shrink-0"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z" />
                  </svg>
                  {fullDate}
                </span>
                <span className="text-slate-600 hidden sm:inline">·</span>
                <span className="text-sm text-slate-400 flex items-center gap-1">
                  <svg
                    className="w-3.5 h-3.5 text-slate-600 shrink-0"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                  </svg>
                  {event.location}
                </span>
              </div>

              {/* Participants */}
              {event.participantCount > 0 && (
                <p className="text-sm text-slate-500 mb-4">
                  <span className="font-bold text-amber-400">
                    {event.participantCount.toLocaleString()}
                  </span>{" "}
                  registered athletes
                </p>
              )}

              {/* Distance badges */}
              <div className="flex flex-wrap gap-2">
                {event.distances.map((d) => (
                  <span
                    key={d.id}
                    className={`text-xs px-3 py-1 rounded-full font-semibold ${distBadgeClass(d.name)}`}
                  >
                    {d.name}
                  </span>
                ))}
              </div>

              {/* Mobile links — desktop versions are in the label row */}
              {(event.participantCount > 0 || event.officialUrl) && (
                <div className="flex sm:hidden flex-wrap gap-2 mt-4 pt-4 border-t border-white/[0.06]">
                  {event.participantCount > 0 && (
                    <Link
                      to={`/event/${event.id}/predictions`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-400/10 text-amber-300 border border-amber-400/20 hover:bg-amber-400/20 transition-colors"
                    >
                      Predictions ✦
                    </Link>
                  )}
                  {event.officialUrl && (
                    <a
                      href={event.officialUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 border border-white/[0.1] hover:text-white hover:border-white/25 transition-colors"
                    >
                      <ShieldCheckIcon />
                      Page ↗
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Large date on desktop */}
            <div className="hidden md:block text-right shrink-0 select-none opacity-40 group-hover:opacity-60 transition-opacity">
              <div className="text-[100px] lg:text-[130px] font-black text-white leading-none tabular-nums">
                {day}
              </div>
              <div className="text-3xl lg:text-4xl font-black text-amber-400 tracking-widest -mt-2">
                {month}
              </div>
              <div className="text-lg text-slate-500 font-bold">{year}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EventListByYear({ events }: { events: StoredEvent[] }) {
  const byYear = useMemo(() => {
    const groups: Array<{ year: number; events: StoredEvent[] }> = [];
    for (const event of events) {
      const year = new Date(event.date + "T12:00:00").getFullYear();
      const existing = groups.find((g) => g.year === year);
      if (existing) {
        existing.events.push(event);
      } else {
        groups.push({ year, events: [event] });
      }
    }

    return groups.sort((a, b) => b.year - a.year);
  }, [events]);

  return (
    <div className="space-y-10">
      {byYear.map(({ year, events: yearEvents }) => (
        <div key={year}>
          {/* Year separator */}
          <div className="flex items-center gap-4 mb-4">
            <span className="text-5xl sm:text-6xl font-black text-white/[0.07] tabular-nums select-none leading-none">
              {year}
            </span>
            <div className="flex-1 h-[1px] bg-gradient-to-r from-white/[0.10] to-transparent" />
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.25em]">
              {yearEvents.length} events
            </span>
          </div>
          {/* Events in this year */}
          <div>
            {yearEvents.map((event, idx) => (
              <EventRow
                key={event.id}
                event={event}
                isFirst={idx === 0}
                animIndex={idx}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EventRow({
  event,
  isFirst,
  animIndex = 0,
}: {
  event: StoredEvent;
  isFirst: boolean;
  animIndex?: number;
}) {
  const isPast = new Date(event.date + "T12:00:00") < new Date();
  const date = new Date(event.date + "T12:00:00");
  const day = date.toLocaleDateString("en-GB", { day: "numeric" });
  const month = date
    .toLocaleDateString("en-GB", { month: "short" })
    .toUpperCase();
  const year = date.getFullYear();
  const delay = Math.min(animIndex * 55, 400);

  return (
    <Link
      to={`/event/${event.id}`}
      style={{ animationDelay: `${delay}ms` }}
      className={`animate-in flex items-center gap-4 sm:gap-6 py-4 sm:py-5 group transition-colors hover:bg-white/[0.03] -mx-4 px-4 rounded-xl relative ${
        !isFirst ? "border-t border-white/[0.05]" : ""
      }`}
    >
      {/* Left accent — faint at rest, bright on hover */}
      <div
        className={`absolute left-0 inset-y-3 w-[2px] rounded-full transition-all duration-300 opacity-20 group-hover:opacity-100 ${!isPast ? "bg-amber-400/80" : event.hasResults ? "bg-emerald-500/70" : "bg-orange-400/70"}`}
      />
      {/* Date column */}
      <div className="w-12 sm:w-14 shrink-0 text-center">
        <div
          className={`text-xl sm:text-2xl font-black leading-none ${isPast ? "text-slate-400" : "text-amber-300"}`}
        >
          {day}
        </div>
        <div
          className={`text-[9px] sm:text-[10px] font-bold tracking-widest mt-0.5 ${isPast ? "text-slate-600" : "text-amber-500"}`}
        >
          {month}
        </div>
        <div className="text-[9px] text-slate-700 mt-0.5">{year}</div>
      </div>

      {/* Vertical divider */}
      <div
        className={`w-[1px] self-stretch shrink-0 ${isPast ? "bg-white/[0.05]" : "bg-amber-500/20"}`}
      />

      {/* Event info */}
      <div className="flex-1 min-w-0">
        <div className="font-display font-black text-lg sm:text-xl text-slate-100 group-hover:text-blue-200 transition-colors leading-snug truncate tracking-wide uppercase">
          {event.name}
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-slate-600 flex-wrap">
          <span className="flex items-center gap-1">
            <svg
              className="w-3 h-3 text-slate-700 shrink-0"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
            {event.location}
          </span>
          {event.hasResults && event.finisherCount > 0 && (
            <>
              <span>·</span>
              <span>
                <span className="text-slate-200 font-bold">
                  {event.finisherCount.toLocaleString()}
                </span>{" "}
                finishers
              </span>
            </>
          )}
          {!isPast && event.participantCount > 0 && (
            <>
              <span>·</span>
              <span>
                <span className="text-amber-500 font-semibold">
                  {event.participantCount.toLocaleString()}
                </span>{" "}
                registered
              </span>
            </>
          )}
          {isPast && !event.hasResults && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-amber-600/60 border border-amber-600/20 bg-amber-500/[0.05] px-1.5 py-px rounded-full">
                <span className="w-1 h-1 rounded-full bg-amber-500/50 shrink-0" />
                Results pending
              </span>
            </>
          )}
        </div>
        {/* Mobile distance badges */}
        <div className="flex gap-1.5 mt-1.5 sm:hidden flex-wrap">
          {event.distances.map((d) => (
            <DistanceBadge key={d.id} name={d.name} />
          ))}
        </div>
      </div>

      {/* Desktop distance badges */}
      <div className="hidden sm:flex gap-1.5 shrink-0 flex-nowrap justify-end">
        {event.distances.map((d) => (
          <DistanceBadge key={d.id} name={d.name} />
        ))}
      </div>

      {/* Arrow */}
      <div className="shrink-0 text-slate-700 group-hover:text-blue-400 group-hover:translate-x-1.5 transition-all duration-200 text-lg">
        →
      </div>
    </Link>
  );
}

function StatPill({
  value,
  label,
  color,
  className = "",
}: {
  value: string | number;
  label: React.ReactNode;
  color: string;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline gap-1.5 ${className}`}>
      <span className={`text-xl sm:text-2xl font-black tabular-nums ${color}`}>
        {value}
      </span>
      <span className="text-[11px] text-slate-600 font-semibold uppercase tracking-wide whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}

function DistanceBadge({ name }: { name: string }) {
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${distBadgeClass(name)}`}
    >
      {name}
    </span>
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
      <div className="flex flex-1 sm:flex-none rounded-xl border border-white/[0.07] overflow-hidden bg-[#0c1628]">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onChange(option)}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 text-sm font-semibold transition-all ${
              value === option
                ? "bg-blue-500/20 text-blue-300"
                : "text-slate-500 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            {format(option)}
          </button>
        ))}
      </div>
    </div>
  );
}
