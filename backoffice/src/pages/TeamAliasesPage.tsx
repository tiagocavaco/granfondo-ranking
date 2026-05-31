import { useCallback, useEffect, useState } from "react";
import { usePagedList } from "../lib/use-paged-list";
import Badge from "../components/Badge";
import CollapsibleForm from "../components/CollapsibleForm";
import { Link } from "react-router-dom";
import { api, type TeamAliasEntry } from "@granfondo/api";
import PageHeader from "../components/PageHeader";
import LoadingState from "../components/LoadingState";
import Combobox from "../components/Combobox";
import DeleteButton from "../components/DeleteButton";
import { adminApi } from "../lib/admin-api";

const emptyForm = { from: "", to: "" };

function AddTeamAliasForm() {
  const [form, setForm] = useState(emptyForm);

  const searchTeams = useCallback(
    (query: string) => api.searchTeams(query),
    [],
  );

  function setField(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <CollapsibleForm
      buttonLabel="+ Add Team Alias"
      title="New Team Alias"
      submitLabel="Add Alias"
      onSubmit={async () => {
        await adminApi.addTeamAlias({
          from: form.from.trim(),
          to: form.to.trim(),
        });
        setForm(emptyForm);
        window.location.reload();
      }}
    >
      <p className="text-xs text-gray-500">
        Values are passed through <code>normalizeTeam()</code> before writing.
        Search to pick existing canonical keys, or type a new one.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            From (alias key)
          </label>
          <Combobox
            value={form.from}
            onChange={(val) => setField("from", val)}
            onSelect={(key: string) => setField("from", key)}
            search={searchTeams}
            itemKey={(key) => key}
            renderItem={(key) => (
              <span className="font-mono text-sm">{key}</span>
            )}
            placeholder="Search existing team key…"
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            To (canonical key)
          </label>
          <Combobox
            value={form.to}
            onChange={(val) => setField("to", val)}
            onSelect={(key: string) => setField("to", key)}
            search={searchTeams}
            itemKey={(key) => key}
            renderItem={(key) => (
              <span className="font-mono text-sm">{key}</span>
            )}
            placeholder="Search existing team key…"
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </CollapsibleForm>
  );
}

export default function TeamAliasesPage() {
  const [entries, setEntries] = useState<TeamAliasEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  function loadEntries() {
    setEntries(null);
    setError(null);
    api
      .getTeamAliases()
      .then(setEntries)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }

  useEffect(loadEntries, []);

  const filtered = entries?.filter(
    (entry) =>
      !search ||
      entry.canonicalKey.toLowerCase().includes(search.toLowerCase()) ||
      entry.aliasKeys.some((key) =>
        key.toLowerCase().includes(search.toLowerCase()),
      ),
  );

  const { visible, sentinelRef, hasMore } = usePagedList(filtered ?? []);

  return (
    <div>
      <PageHeader
        title="Team Aliases"
        description={
          entries
            ? `${entries.length} team${entries.length === 1 ? "" : "s"} with aliases`
            : undefined
        }
      >
        <input
          type="search"
          placeholder="Filter by key…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-56 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </PageHeader>

      <div className="px-6 py-3 border-b border-gray-100">
        <AddTeamAliasForm />
      </div>

      {entries === null && <LoadingState error={error} />}
      {entries !== null && filtered?.length === 0 && (
        <div className="p-6 text-sm text-gray-500">No matches.</div>
      )}
      {filtered && filtered.length > 0 && (
        <div className="divide-y divide-gray-100">
          {visible.map((entry) => (
            <div key={entry.id} className="px-6 py-4">
              <div className="font-medium font-mono text-sm">
                <Link
                  to={`/team/${encodeURIComponent(entry.canonicalKey)}`}
                  className="text-blue-600 hover:underline"
                >
                  {entry.canonicalKey}
                </Link>
                <Badge color="blue">canonical</Badge>
              </div>
              <div className="mt-1.5 space-y-0.5 pl-4 border-l-2 border-gray-200">
                {entry.aliasKeys.map((key) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="font-mono text-sm text-gray-600">
                      {key}
                    </span>
                    <DeleteButton
                      onDelete={async () => {
                        await adminApi.removeTeamAlias({ from: key });
                        window.location.reload();
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {hasMore && <div ref={sentinelRef} className="h-4" />}
        </div>
      )}
    </div>
  );
}
