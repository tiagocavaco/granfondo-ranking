import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@granfondo/api";
import type { StoredEvent } from "@granfondo/database/types";
import ResultsTab from "./ResultsTab";
import ParticipantsTab from "./ParticipantsTab";
import { Spinner } from "../shared/Spinner";
import { NotFoundState, ghostButtonClass } from "../shared/NotFoundState";
import { distBadgeClass } from "../../utils/distance";
import { isEventPast } from "../../utils/date";
import { ShieldCheckIcon } from "../shared/ShieldCheckIcon";
import { usePageTitle } from "../../hooks/usePageTitle";

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<StoredEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  usePageTitle(event?.name);

  useEffect(() => {
    if (!id) {
      return;
    }

    setLoading(true);
    api
      .getEvents()
      .then((events) => {
        const found = events.find((e) => e.id === Number(id));
        if (!found) {
          throw new Error("Event not found");
        }

        setEvent(found);
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <Spinner />;
  }

  if (error || !event) {
    return (
      <NotFoundState
        label="Event not found"
        description="This event doesn't exist or may have been removed."
        action={
          <Link to="/" className={ghostButtonClass}>
            ← Events
          </Link>
        }
      />
    );
  }

  const isPast = isEventPast(event.date, event.hasResults);
  const dateObj = new Date(event.date + "T00:00:00");
  const heroDay = dateObj.toLocaleDateString("en-GB", { day: "numeric" });
  const heroMonth = dateObj
    .toLocaleDateString("en-GB", { month: "short" })
    .toUpperCase();
  const heroYear = dateObj.getFullYear();
  const heroWeekday = dateObj.toLocaleDateString("en-GB", { weekday: "long" });

  return (
    <div>
      <button
        onClick={() => navigate("/")}
        className="text-sm text-slate-500 hover:text-slate-300 transition-colors mb-4 inline-flex items-center gap-1"
      >
        ← Back
      </button>

      {/* Event hero */}
      <div className="relative bg-[#0c1628] rounded-2xl p-6 sm:p-8 mb-6 text-white overflow-hidden border border-white/[0.07]">
        {/* Top accent line */}
        <div
          className={`absolute inset-x-0 top-0 h-[2px] ${
            !isPast
              ? "bg-gradient-to-r from-amber-400/0 via-amber-400 to-amber-400/0"
              : event.hasResults
                ? "bg-gradient-to-r from-emerald-500/0 via-emerald-500 to-emerald-500/0"
                : "bg-gradient-to-r from-orange-500/0 via-orange-400 to-orange-500/0"
          }`}
        />
        {/* Ghost date watermark — desktop only */}
        <div className="absolute right-6 sm:right-8 top-0 bottom-0 hidden sm:flex flex-col items-end justify-end pb-4 sm:pb-6 select-none pointer-events-none [mask-image:linear-gradient(to_top,black_20%,transparent_75%)]">
          <div className="text-[72px] sm:text-[88px] font-black text-white leading-none tabular-nums opacity-[0.05]">
            {heroDay}
          </div>
          <div className="text-[20px] sm:text-[24px] font-black text-amber-400 tracking-widest -mt-1 opacity-[0.10]">
            {heroMonth}
          </div>
          <div className="text-sm font-bold text-slate-500 opacity-60 mt-0.5">
            {heroYear}
          </div>
        </div>

        <div className="relative">
          {/* Top meta row */}
          <div className="flex items-center gap-2.5 mb-5">
            <span
              className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-widest ${
                !isPast
                  ? "bg-amber-400/15 text-amber-300 border border-amber-400/25"
                  : isPast && !event.hasResults
                    ? "bg-amber-500/10 text-amber-600/70 border border-amber-600/20"
                    : "bg-emerald-500/10 text-emerald-600/70 border border-emerald-600/20"
              }`}
            >
              {!isPast
                ? "Upcoming"
                : !event.hasResults
                  ? "Results pending"
                  : "Finished"}
            </span>
            <span className="text-slate-500 text-xs font-medium">
              {heroWeekday} · {heroDay} {heroMonth} {heroYear}
            </span>
            <div className="hidden sm:flex gap-2 ml-auto">
              {!event.hasResults && event.participantCount > 0 && (
                <Link
                  to={`/event/${event.id}/predictions`}
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
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/[0.06] text-slate-300 border border-white/[0.08] hover:bg-white/[0.12] hover:text-white transition-colors"
                >
                  <ShieldCheckIcon />
                  Official Page ↗
                </a>
              )}
              {isPast && event.resultsUrl && (
                <a
                  href={event.resultsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/[0.06] text-slate-300 border border-white/[0.08] hover:bg-white/[0.12] hover:text-white transition-colors"
                >
                  <ShieldCheckIcon />
                  Official Results ↗
                </a>
              )}
              {!isPast && !event.officialUrl && event.resultsUrl && (
                <a
                  href={event.resultsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/[0.06] text-slate-300 border border-white/[0.08] hover:bg-white/[0.12] hover:text-white transition-colors"
                >
                  <ShieldCheckIcon />
                  Official Page ↗
                </a>
              )}
            </div>
          </div>

          <div className="flex items-start justify-between gap-3 mb-5">
            <h1 className="font-display font-bold text-3xl sm:text-4xl text-white leading-tight tracking-wide uppercase">
              {event.name}
            </h1>
            <div className="sm:hidden shrink-0 text-right select-none pt-1 opacity-20">
              <div className="text-[38px] font-black text-white leading-none tabular-nums">
                {heroDay}
              </div>
              <div className="text-[11px] font-black text-amber-400 tracking-widest mt-0.5">
                {heroMonth}
              </div>
              <div className="text-[9px] font-bold text-slate-400 mt-0.5">
                {heroYear}
              </div>
            </div>
          </div>

          {/* Location + finishers row */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mb-4 text-sm text-slate-500">
            <span className="flex items-center gap-1.5">
              <svg
                className="w-3.5 h-3.5 text-slate-600 shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
              </svg>
              <span>{event.location}</span>
            </span>
            {event.hasResults && event.finisherCount > 0 && (
              <span className="flex items-center gap-1.5">
                <svg
                  className="w-3.5 h-3.5 text-slate-600 shrink-0"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z" />
                </svg>
                <span>
                  <strong className="text-slate-200 font-bold">
                    {event.finisherCount.toLocaleString()}
                  </strong>{" "}
                  finishers
                </span>
              </span>
            )}
            {!event.hasResults && event.participantCount > 0 && (
              <span className="flex items-center gap-1.5">
                <svg
                  className="w-3.5 h-3.5 text-slate-600 shrink-0"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                </svg>
                <span>
                  <strong className="text-amber-400 font-bold">
                    {event.participantCount.toLocaleString()}
                  </strong>{" "}
                  registered
                </span>
              </span>
            )}
          </div>

          {/* Distance badges */}
          <div className="flex flex-wrap gap-2 mb-3">
            {event.distances.map((d) => (
              <span
                key={d.id}
                className={`shrink-0 text-xs px-3 py-1 rounded-full font-semibold ${distBadgeClass(d.name)}`}
              >
                {d.name}
              </span>
            ))}
          </div>

          {/* Mobile CTAs — left-aligned, own row */}
          <div className="flex sm:hidden gap-2 mt-4 pt-4 border-t border-white/[0.06]">
            {!event.hasResults && event.participantCount > 0 && (
              <Link
                to={`/event/${event.id}/predictions`}
                className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-400/10 text-amber-300 border border-amber-400/20 hover:bg-amber-400/20 transition-colors"
              >
                Predictions ✦
              </Link>
            )}
            {event.officialUrl && (
              <a
                href={event.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/[0.06] text-slate-300 border border-white/[0.08] hover:bg-white/[0.12] transition-colors"
              >
                <ShieldCheckIcon />
                <span className="sm:hidden">Page ↗</span>
                <span className="hidden sm:inline">Official Page ↗</span>
              </a>
            )}
            {isPast && event.resultsUrl && (
              <a
                href={event.resultsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/[0.06] text-slate-300 border border-white/[0.08] hover:bg-white/[0.12] transition-colors"
              >
                <ShieldCheckIcon />
                <span className="sm:hidden">Results ↗</span>
                <span className="hidden sm:inline">Official Results ↗</span>
              </a>
            )}
            {!isPast && !event.officialUrl && event.resultsUrl && (
              <a
                href={event.resultsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/[0.06] text-slate-300 border border-white/[0.08] hover:bg-white/[0.12] transition-colors"
              >
                <ShieldCheckIcon />
                <span className="sm:hidden">Page ↗</span>
                <span className="hidden sm:inline">Official Page ↗</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {isPast && event.hasResults ? (
        <ResultsTab
          eventId={event.id}
          distances={event.distances}
          resultsUrl={event.resultsUrl}
        />
      ) : (
        <ParticipantsTab eventId={event.id} />
      )}
    </div>
  );
}
