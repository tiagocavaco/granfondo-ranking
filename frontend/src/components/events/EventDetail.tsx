import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@granfondo/api";
import type { StoredEvent } from "@granfondo/database/types";
import ResultsTab from "./ResultsTab";
import ParticipantsTab from "./ParticipantsTab";
import { Spinner, ErrorBanner } from "../shared/Spinner";
import { distBadgeClassBordered } from "../../utils/distance";

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<StoredEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    return <ErrorBanner>{error ?? "Event not found"}</ErrorBanner>;
  }

  const isPast = new Date(event.date + "T12:00:00") < new Date();
  const dateObj = new Date(event.date + "T00:00:00");
  const date = dateObj.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const heroDay = dateObj.toLocaleDateString("en-GB", { day: "numeric" });
  const heroMonth = dateObj.toLocaleDateString("en-GB", { month: "short" }).toUpperCase();
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
            isPast
              ? "bg-gradient-to-r from-white/0 via-white/15 to-white/0"
              : "bg-gradient-to-r from-amber-400/0 via-amber-400 to-amber-400/0"
          }`}
        />
        {/* Ghost date watermark — fades out before reaching the badges row */}
        <div className="absolute right-0 top-0 bottom-0 flex flex-col items-end justify-center pr-6 select-none pointer-events-none [mask-image:linear-gradient(to_bottom,black_50%,transparent_90%)]">
          <div className="text-[100px] sm:text-[130px] font-black text-white leading-none tabular-nums opacity-[0.04]">
            {heroDay}
          </div>
          <div className="text-[28px] sm:text-[36px] font-black text-amber-400 tracking-widest -mt-2 opacity-[0.08]">
            {heroMonth}
          </div>
        </div>

        <div className="relative">
          <p className="text-[10px] font-black tracking-[0.3em] text-blue-500/70 uppercase mb-3">
            Portuguese Granfondo Series
          </p>
          {/* Top meta row */}
          <div className="flex items-center gap-2.5 mb-5">
            <span
              className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-widest ${
                isPast
                  ? "bg-white/[0.07] text-slate-400 border border-white/[0.08]"
                  : "bg-amber-400/15 text-amber-300 border border-amber-400/25"
              }`}
            >
              {isPast ? "Finished" : "Upcoming"}
            </span>
            <span className="text-slate-500 text-xs font-medium">
              {heroWeekday} · {heroDay} {heroMonth} {heroYear}
            </span>
            <div className="hidden sm:flex gap-2 ml-auto">
              {!isPast && event.participantCount > 0 && (
                <Link
                  to={`/event/${event.id}/predictions`}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-400/10 text-amber-300 border border-amber-400/20 hover:bg-amber-400/20 transition-colors"
                >
                  Predictions ✦
                </Link>
              )}
              {!isPast && (event.officialUrl ?? event.resultsUrl) && (
                <a
                  href={event.officialUrl ?? event.resultsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/[0.06] text-slate-300 border border-white/[0.08] hover:bg-white/[0.12] hover:text-white transition-colors"
                >
                  Official Page ↗
                </a>
              )}
              {isPast && event.officialUrl && (
                <a
                  href={event.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/[0.06] text-slate-300 border border-white/[0.08] hover:bg-white/[0.12] hover:text-white transition-colors"
                >
                  Official Page ↗
                </a>
              )}
              {isPast && event.resultsUrl && (
                <a
                  href={event.resultsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/[0.06] text-slate-300 border border-white/[0.08] hover:bg-white/[0.12] hover:text-white transition-colors"
                >
                  Official Results ↗
                </a>
              )}
            </div>
          </div>

          <h1 className="font-display font-bold text-3xl sm:text-4xl text-white mb-5 leading-tight tracking-wide uppercase">
            {event.name}
          </h1>

          {/* Location + finishers row */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mb-4 text-sm text-slate-500">
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-slate-600 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
              <span>{event.location}</span>
            </span>
            {event.hasResults && event.finisherCount > 0 && (
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-slate-600 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/>
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
                <svg className="w-3.5 h-3.5 text-slate-600 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
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
                className={`shrink-0 text-xs px-3 py-1 rounded-full font-semibold ${distBadgeClassBordered(d.name)}`}
              >
                {d.name}
              </span>
            ))}
          </div>

          {/* Mobile CTAs — left-aligned, own row */}
          <div className="flex sm:hidden gap-2">
            {!isPast && event.participantCount > 0 && (
              <Link
                to={`/event/${event.id}/predictions`}
                className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-400/10 text-amber-300 border border-amber-400/20 hover:bg-amber-400/20 transition-colors"
              >
                Predictions ✦
              </Link>
            )}
            {!isPast && (event.officialUrl ?? event.resultsUrl) && (
              <a
                href={event.officialUrl ?? event.resultsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/[0.06] text-slate-300 border border-white/[0.08] hover:bg-white/[0.12] transition-colors"
              >
                Official Page ↗
              </a>
            )}
            {isPast && event.officialUrl && (
              <a
                href={event.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/[0.06] text-slate-300 border border-white/[0.08] hover:bg-white/[0.12] transition-colors"
              >
                Official Page ↗
              </a>
            )}
            {isPast && event.resultsUrl && (
              <a
                href={event.resultsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/[0.06] text-slate-300 border border-white/[0.08] hover:bg-white/[0.12] transition-colors"
              >
                Official Results ↗
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
