import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, type EventMatch, type RawEvent } from "@granfondo/api";
import PageHeader from "../components/PageHeader";
import LoadingState from "../components/LoadingState";
import { usePagedList } from "../lib/use-paged-list";

function EventSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [allEvents, setAllEvents] = useState<EventMatch[] | null>(null);

  useEffect(() => {
    api
      .listRawEvents()
      .then(setAllEvents)
      .catch(() => setAllEvents([]));
  }, []);

  const lower = query.trim().toLowerCase();
  const filtered = allEvents
    ? lower.length === 0
      ? allEvents
      : allEvents.filter(
          (event) =>
            event.name.toLowerCase().includes(lower) ||
            String(event.id).includes(lower),
        )
    : [];

  const { visible, sentinelRef, hasMore } = usePagedList(filtered);

  return (
    <div className="p-6 space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Filter by name or ID
        </label>
        <input
          type="search"
          placeholder="Filter by name or ID…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
          className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {allEvents === null && <p className="text-xs text-gray-400">Loading…</p>}
      {allEvents !== null && filtered.length === 0 && (
        <p className="text-xs text-gray-500">No events found for "{query}".</p>
      )}
      {allEvents !== null && filtered.length > 0 && (
        <>
          <div className="border border-gray-200 rounded-md overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Year
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {visible.map((event) => (
                  <tr
                    key={event.id}
                    className="hover:bg-blue-50 cursor-pointer"
                    onClick={() => navigate(`/event/${event.id}`)}
                  >
                    <td className="px-3 py-2 font-mono text-gray-400 text-xs">
                      {event.id}
                    </td>
                    <td className="px-3 py-2 font-medium">{event.name}</td>
                    <td className="px-3 py-2 font-mono text-gray-500 text-xs">
                      {event.year}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && <div ref={sentinelRef} className="h-4" />}
        </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-gray-400 w-36 shrink-0">{label}</span>
      <span className="font-medium break-all">{value}</span>
    </div>
  );
}

function EventDetail({ event }: { event: RawEvent }) {
  return (
    <div className="p-6 space-y-6">
      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          events row
        </h3>
        <div className="bg-white border border-gray-200 rounded-md p-4 font-mono text-sm space-y-1.5">
          <Field label="id" value={event.id} />
          <Field label="name" value={event.name} />
          <Field label="year" value={event.year} />
          <Field label="date" value={event.date} />
          <Field
            label="location"
            value={event.location || <span className="text-gray-300">—</span>}
          />
          <Field
            label="has_results"
            value={
              <span
                className={
                  event.hasResults ? "text-green-600" : "text-gray-400"
                }
              >
                {event.hasResults ? "1" : "0"}
              </span>
            }
          />
          <Field label="participant_count" value={event.participantCount} />
          <Field label="finisher_count" value={event.finisherCount} />
          <Field
            label="scraped_at"
            value={
              event.scrapedAt ?? <span className="text-gray-300">null</span>
            }
          />
          {event.officialUrl && (
            <Field
              label="official_url"
              value={
                <a
                  href={event.officialUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {event.officialUrl}
                </a>
              }
            />
          )}
          {event.resultsUrl && (
            <Field
              label="results_url"
              value={
                <a
                  href={event.resultsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {event.resultsUrl}
                </a>
              }
            />
          )}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          event_distances ({event.distances.length})
        </h3>
        {event.distances.length === 0 ? (
          <p className="text-sm text-gray-500">No distances.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Results
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {event.distances.map((dist) => (
                  <tr key={dist.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs text-gray-400">
                      {dist.id}
                    </td>
                    <td className="px-3 py-2">{dist.name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500 text-right">
                      {dist.resultCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default function RawEventPage() {
  const { eventId } = useParams<{ eventId?: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<RawEvent | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numericId = eventId ? parseInt(eventId, 10) : null;

  useEffect(() => {
    if (!numericId) return;
    setLoading(true);
    setEvent(null);
    setNotFound(false);
    setError(null);
    api
      .getRawEvent(numericId)
      .then((result) => {
        if (!result) setNotFound(true);
        else setEvent(result);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => setLoading(false));
  }, [numericId]);

  if (!numericId) {
    return (
      <div>
        <PageHeader
          title="Raw Event"
          description="Inspect underlying DB rows for an event"
        />
        <EventSearch />
      </div>
    );
  }

  if (loading)
    return (
      <div>
        <PageHeader title={`Event #${numericId}`} />
        <LoadingState />
      </div>
    );
  if (error)
    return (
      <div>
        <PageHeader title={`Event #${numericId}`} />
        <LoadingState error={error} />
      </div>
    );

  if (notFound) {
    return (
      <div>
        <PageHeader title={`Event #${numericId}`} />
        <div className="p-6 text-sm text-gray-500">
          Event {numericId} not found.{" "}
          <Link to="/event" className="text-blue-600 hover:underline">
            Search again
          </Link>
        </div>
      </div>
    );
  }

  if (!event) return null;

  return (
    <div>
      <PageHeader
        title={event.name}
        description={`ID ${event.id} · ${event.year} · ${event.distances.length} distance${event.distances.length === 1 ? "" : "s"}`}
      >
        <Link to="/event" className="text-sm text-gray-500 hover:text-gray-900">
          ← Search
        </Link>
      </PageHeader>
      <EventDetail event={event} />
    </div>
  );
}
