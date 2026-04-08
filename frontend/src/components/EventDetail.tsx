import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { StoredEvent } from "../types";
import ParticipantsTab from "./ParticipantsTab";
import RankingsTab from "./RankingsTab";
import { Spinner, ErrorBanner } from "./EventList";

type Tab = "rankings" | "participants";

const DIST_COLORS: Record<string, string> = {
  Granfondo: "bg-blue-100 text-blue-700 border border-blue-200",
  GranFondo: "bg-blue-100 text-blue-700 border border-blue-200",
  Mediofondo: "bg-violet-100 text-violet-700 border border-violet-200",
  Minifondo: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  "Time Trial": "bg-amber-100 text-amber-700 border border-amber-200",
  "TIME TRIAL": "bg-amber-100 text-amber-700 border border-amber-200",
};

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<StoredEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("rankings");

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

  const isPast = new Date(event.date + "T00:00:00") < new Date();
  const date = new Date(event.date + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "rankings", label: "Results", icon: "🏁" },
    { key: "participants", label: "Participants", icon: "👥" },
  ];

  return (
    <div>
      {/* Back */}
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-800 mb-5 group"
      >
        <span className="group-hover:-translate-x-0.5 transition-transform">←</span>
        Back to events
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
            <span className="text-blue-300 text-xs font-medium">{event.year}</span>
          </div>

          <h1 className="text-2xl font-extrabold text-white mb-4 leading-tight">
            {event.name}
          </h1>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm mb-4">
            <div className="flex items-center gap-2 text-blue-200">
              <span>📅</span>
              <span>{date}</span>
            </div>
            <div className="flex items-center gap-2 text-blue-200">
              <span>📍</span>
              <span>{event.location}</span>
            </div>
            {event.hasResults && (
              <div className="flex items-center gap-2 text-blue-200">
                <span>🏁</span>
                <span>
                  <strong className="text-white">{event.finisherCount.toLocaleString()}</strong> finishers
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {event.distances.map((d) => (
              <span
                key={d.id}
                className={`text-xs px-3 py-1 rounded-full font-semibold ${
                  DIST_COLORS[d.name] ?? "bg-white/10 text-white border border-white/20"
                }`}
              >
                {d.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {tabs.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === key
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600"
            }`}
          >
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {tab === "rankings" && <RankingsTab eventId={event.id} distances={event.distances} />}
      {tab === "participants" && <ParticipantsTab eventId={event.id} />}
    </div>
  );
}
