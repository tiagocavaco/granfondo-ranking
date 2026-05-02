import { useNavigate } from "react-router-dom";
import type { StoredEvent } from "@granfondo/database/types";
import { distBadgeClass } from "../utils/distance";

interface Props {
  event: StoredEvent;
}

export default function EventCard({ event }: Props) {
  const navigate = useNavigate();
  const isPast = new Date(event.date + "T12:00:00") < new Date();
  const date = new Date(event.date + "T12:00:00");
  const formatted = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div
      onClick={() => navigate(`/event/${event.id}`)}
      className="bg-white rounded-2xl border border-slate-200 p-5 cursor-pointer card-hover group overflow-hidden relative"
    >
      {/* Accent bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity rounded-t-2xl" />

      <div className="flex items-start justify-between gap-2 mb-4">
        <h2 className="font-bold text-slate-900 text-sm leading-snug line-clamp-2 group-hover:text-blue-700 transition-colors">
          {event.name}
        </h2>
        <span
          className={`shrink-0 text-[11px] px-2.5 py-0.5 rounded-full font-semibold tracking-wide ${
            isPast
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-amber-50 text-amber-700 border border-amber-200"
          }`}
        >
          {isPast ? "Finished" : "Upcoming"}
        </span>
      </div>

      <div className="space-y-1.5 text-xs text-slate-500 mb-4">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">📅</span>
          <span className="font-medium text-slate-700">{formatted}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">📍</span>
          <span className="truncate">{event.location}</span>
        </div>
        {event.hasResults && event.finisherCount > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">🏁</span>
            <span><span className="font-semibold text-slate-700">{event.finisherCount.toLocaleString()}</span> finishers</span>
          </div>
        )}
        {!isPast && event.participantCount > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">📋</span>
            <span><span className="font-semibold text-slate-700">{event.participantCount.toLocaleString()}</span> participants</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5 overflow-hidden min-w-0">
          {event.distances.map((d) => (
            <span
              key={d.id}
              className={`shrink-0 text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${
                distBadgeClass(d.name)
              }`}
            >
              {d.name}
            </span>
          ))}
        </div>
        {!isPast && (event.officialUrl ?? event.resultsUrl) && (
          <a
            href={event.officialUrl ?? event.resultsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="hidden sm:block shrink-0 text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline"
          >
            Official Page ↗
          </a>
        )}
        {isPast && event.resultsUrl && (
          <a
            href={event.resultsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="hidden sm:block shrink-0 text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline"
          >
            Official Results ↗
          </a>
        )}
      </div>
    </div>
  );
}
