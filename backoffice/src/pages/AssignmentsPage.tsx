import { useCallback, useEffect, useState } from "react";
import { usePagedList } from "../lib/use-paged-list";
import CollapsibleForm from "../components/CollapsibleForm";
import { api, type EventMatch, type ResultAssignment } from "@granfondo/api";
import DeleteButton from "../components/DeleteButton";
import Combobox from "../components/Combobox";
import PageHeader from "../components/PageHeader";
import LoadingState from "../components/LoadingState";
import { adminApi } from "../lib/admin-api";

function matchesSearch(assignment: ResultAssignment, term: string): boolean {
  const lower = term.toLowerCase();
  if (String(assignment.eventId).includes(lower)) return true;
  if (assignment.bib.toLowerCase().includes(lower)) return true;
  if (String(assignment.athleteId).includes(lower)) return true;
  if (assignment.athleteName?.toLowerCase().includes(lower)) return true;
  if (assignment.note?.toLowerCase().includes(lower)) return true;
  return false;
}

const emptyForm = { eventId: "", eventQuery: "", bib: "", athleteId: "", note: "" };

function AddAssignmentForm() {
  const [form, setForm] = useState(emptyForm);

  const searchEvents = useCallback(
    (query: string) => api.searchEvents(query),
    [],
  );

  function setField(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <CollapsibleForm
      buttonLabel="+ Add Assignment"
      title="New Result Assignment"
      submitLabel="Add Assignment"
      onSubmit={async () => {
        const eventId = Number(form.eventId);
        const athleteId = Number(form.athleteId);
        if (!Number.isInteger(eventId) || eventId <= 0) {
          throw new Error("Select a valid event");
        }
        if (!Number.isInteger(athleteId) || athleteId <= 0) {
          throw new Error("Athlete ID must be a positive integer");
        }
        await adminApi.addAssignment({
          eventId,
          bib: form.bib.trim(),
          athleteId,
          note: form.note.trim() || undefined,
        });
        setForm(emptyForm);
        window.location.reload();
      }}
    >
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Event
            {form.eventId && (
              <span className="ml-1.5 font-mono text-gray-400">
                #{form.eventId}
              </span>
            )}
          </label>
          <Combobox
            value={form.eventQuery}
            onChange={(val) => {
              setField("eventQuery", val);
              setField("eventId", "");
            }}
            onSelect={(match: EventMatch) => {
              setField("eventId", String(match.id));
              setField("eventQuery", `${match.name} (${match.year})`);
            }}
            search={searchEvents}
            itemKey={(match) => String(match.id)}
            renderItem={(match) => (
              <span className="flex items-baseline gap-2">
                <span className="font-medium">{match.name}</span>
                <span className="text-gray-400 text-xs">{match.year}</span>
                <span className="font-mono text-gray-300 text-xs ml-auto">
                  {match.id}
                </span>
              </span>
            )}
            placeholder="Search by name or ID…"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Bib
          </label>
          <input
            required
            placeholder="e.g. 42"
            value={form.bib}
            onChange={(e) => setField("bib", e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Athlete ID
          </label>
          <input
            required
            type="number"
            min={1}
            placeholder="e.g. 381"
            value={form.athleteId}
            onChange={(e) => setField("athleteId", e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="col-span-3">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Note (optional)
          </label>
          <input
            placeholder="Why this assignment was created"
            value={form.note}
            onChange={(e) => setField("note", e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </CollapsibleForm>
  );
}


export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<ResultAssignment[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  function loadAssignments() {
    setAssignments(null);
    setError(null);
    api
      .getResultAssignments()
      .then(setAssignments)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }

  useEffect(loadAssignments, []);

  const filtered = assignments?.filter(
    (assignment) => !search || matchesSearch(assignment, search),
  );

  const { visible, sentinelRef, hasMore } = usePagedList(filtered ?? []);

  return (
    <div>
      <PageHeader
        title="Result Assignments"
        description={
          assignments
            ? filtered?.length !== assignments.length
              ? `${filtered?.length} of ${assignments.length} assignments`
              : `${assignments.length} assignment${assignments.length === 1 ? "" : "s"}`
            : undefined
        }
      >
        <input
          type="search"
          placeholder="Filter by event, bib, athlete…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-64 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </PageHeader>

      <div className="px-6 py-3 border-b border-gray-100">
        <AddAssignmentForm />
      </div>

      {assignments === null && <LoadingState error={error} />}
      {filtered !== undefined && filtered.length === 0 && (
        <div className="p-6 text-sm text-gray-500">
          {search
            ? `No assignments match "${search}".`
            : "No manual result assignments found."}
        </div>
      )}
      {filtered !== undefined && filtered.length > 0 && (
        <div className="p-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="pb-2 pr-4 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">
                  ID
                </th>
                <th className="pb-2 pr-4 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">
                  Event ID
                </th>
                <th className="pb-2 pr-4 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">
                  Bib
                </th>
                <th className="pb-2 pr-4 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">
                  Athlete
                </th>
                <th className="pb-2 pr-4 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">
                  Note
                </th>
                <th className="pb-2 text-right font-medium text-gray-500 text-xs uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((assignment) => (
                <tr key={assignment.id} className="hover:bg-gray-50">
                  <td className="py-2 pr-4 font-mono text-gray-400 text-xs">
                    #{assignment.id}
                  </td>
                  <td className="py-2 pr-4">
                    <span className="font-mono text-gray-400 text-xs mr-1.5">
                      {assignment.eventId}
                    </span>
                    {assignment.eventName ?? ""}
                  </td>
                  <td className="py-2 pr-4 font-mono">{assignment.bib}</td>
                  <td className="py-2 pr-4">
                    <a
                      href={`/athlete/${assignment.athleteId}`}
                      className="text-blue-600 hover:underline"
                    >
                      {assignment.athleteName ?? (
                        <span className="font-mono">
                          {assignment.athleteId}
                        </span>
                      )}
                    </a>
                    {assignment.athleteName && (
                      <span className="ml-2 font-mono text-xs text-gray-400">
                        #{assignment.athleteId}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-gray-500 italic">
                    {assignment.note ?? "—"}
                  </td>
                  <td className="py-2 text-right">
                    <DeleteButton
                      onDelete={async () => {
                        await adminApi.removeAssignment({
                          eventId: assignment.eventId,
                          bib: assignment.bib,
                        });
                        window.location.reload();
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasMore && <div ref={sentinelRef} className="h-4" />}
        </div>
      )}
    </div>
  );
}
