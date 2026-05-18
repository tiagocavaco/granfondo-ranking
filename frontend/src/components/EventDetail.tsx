import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../api";
import type { StoredEvent } from "@granfondo/database/types";
import ResultsTab from "./ResultsTab";
import ParticipantsTab from "./ParticipantsTab";
import { Spinner, ErrorBanner } from "./EventList";
import { distBadgeClassBordered } from "../utils/distance";

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<StoredEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .getEvents()
      .then((events) => {
        const found = events.find((e) => e.id === Number(id));
        if (!found) throw new Error("Event not found");
        setEvent(found);
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner />;
  if (error || !event) return <ErrorBanner>{error ?? "Event not found"}</ErrorBanner>;

  const isPast = new Date(event.date + "T12:00:00") < new Date();
  const date = new Date(event.date + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      <button
        onClick={() => navigate("/")}
        className="text-sm text-slate-400 hover:text-slate-600 transition-colors mb-4 inline-flex items-center gap-1"
      >
        ← Back
      </button>

      {/* Event hero */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-900 rounded-2xl p-6 mb-6 text-white overflow-hidden relative">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-2 right-8 text-9xl">🚴</div>
        </div>
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                isPast
                  ? "bg-emerald-400/20 text-emerald-300 border border-emerald-400/30"
                  : "bg-amber-400/20 text-amber-300 border border-amber-400/30"
              }`}
            >
              {isPast ? "Finished" : "Upcoming"}
            </span>
            <span className="text-blue-300 text-xs font-medium">📅 {date}</span>
            <div className="hidden sm:flex gap-2 ml-auto">
              {!isPast && event.participantCount > 0 && (
                <Link to={`/event/${event.id}/predictions`}
                  className="text-xs font-semibold px-3 py-1 rounded-lg bg-amber-400/20 text-amber-300 border border-amber-400/30 hover:bg-amber-400/30 transition-colors">
                  Predictions ✦
                </Link>
              )}
              {!isPast && (event.officialUrl ?? event.resultsUrl) && (
                <a href={event.officialUrl ?? event.resultsUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-semibold px-3 py-1 rounded-lg bg-white/10 text-white border border-white/20 hover:bg-white/20 transition-colors">
                  Official Page ↗
                </a>
              )}
              {isPast && event.officialUrl && (
                <a href={event.officialUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-semibold px-3 py-1 rounded-lg bg-white/10 text-white border border-white/20 hover:bg-white/20 transition-colors">
                  Official Page ↗
                </a>
              )}
              {isPast && event.resultsUrl && (
                <a href={event.resultsUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-semibold px-3 py-1 rounded-lg bg-white/10 text-white border border-white/20 hover:bg-white/20 transition-colors">
                  Official Results ↗
                </a>
              )}
            </div>
          </div>

          <h1 className="text-2xl font-extrabold text-white mb-4 leading-tight">
            {event.name}
          </h1>

          {/* Mobile meta */}
          <div className="sm:hidden flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mb-4 text-blue-200">
            <span className="flex items-center gap-1.5">
              <span>📍</span>
              <span>{event.location}</span>
            </span>
            {event.hasResults && event.finisherCount > 0 && (
              <span className="flex items-center gap-1.5">
                <span>🏁</span>
                <span><strong className="text-white">{event.finisherCount.toLocaleString()}</strong> finishers</span>
              </span>
            )}
            {!event.hasResults && event.participantCount > 0 && (
              <span className="flex items-center gap-1.5">
                <span>📋</span>
                <span><strong className="text-white">{event.participantCount.toLocaleString()}</strong> participants</span>
              </span>
            )}
          </div>

          {/* Pills row — on desktop also shows location + finishers on the right */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex gap-2">
              {event.distances.map((d) => (
                <span
                  key={d.id}
                  className={`shrink-0 text-xs px-3 py-1 rounded-full font-semibold ${
                    distBadgeClassBordered(d.name)
                  }`}
                >
                  {d.name}
                </span>
              ))}
            </div>
            <div className="hidden sm:flex items-center gap-3 ml-auto text-sm text-blue-200">
              <span className="flex items-center gap-1.5">
                <span>📍</span>
                <span>{event.location}</span>
              </span>
              {event.hasResults && event.finisherCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <span>🏁</span>
                  <span><strong className="text-white">{event.finisherCount.toLocaleString()}</strong> finishers</span>
                </span>
              )}
              {!event.hasResults && event.participantCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <span>📋</span>
                  <span><strong className="text-white">{event.participantCount.toLocaleString()}</strong> participants</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex sm:hidden gap-2 mt-1">
              {!isPast && event.participantCount > 0 && (
                <Link
                  to={`/event/${event.id}/predictions`}
                  className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-400/20 text-amber-300 border border-amber-400/30 hover:bg-amber-400/30 transition-colors"
                >
                  Predictions ✦
                </Link>
              )}
              {!isPast && (event.officialUrl ?? event.resultsUrl) && (
                <a
                  href={event.officialUrl ?? event.resultsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/10 text-white border border-white/20 hover:bg-white/20 transition-colors"
                >
                  Official Page ↗
                </a>
              )}
              {isPast && event.officialUrl && (
                <a
                  href={event.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/10 text-white border border-white/20 hover:bg-white/20 transition-colors"
                >
                  Official Page ↗
                </a>
              )}
              {isPast && event.resultsUrl && (
                <a
                  href={event.resultsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/10 text-white border border-white/20 hover:bg-white/20 transition-colors"
                >
                  Official Results ↗
                </a>
              )}
            </div>
        </div>
      </div>

      {isPast && event.hasResults
        ? <ResultsTab eventId={event.id} distances={event.distances} resultsUrl={event.resultsUrl} />
        : <ParticipantsTab eventId={event.id} />}
    </div>
  );
}
