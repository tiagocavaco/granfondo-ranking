import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type AthleteAliasRule, type RawNameMatch } from "@granfondo/api";
import PageHeader from "../components/PageHeader";
import LoadingState from "../components/LoadingState";
import Combobox from "../components/Combobox";
import DeleteButton from "../components/DeleteButton";
import Badge from "../components/Badge";
import CollapsibleForm from "../components/CollapsibleForm";
import { adminApi } from "../lib/admin-api";
import { usePagedList } from "../lib/use-paged-list";

function matchesSearch(rule: AthleteAliasRule, term: string): boolean {
  const lower = term.toLowerCase();
  if (rule.name.toLowerCase().includes(lower)) return true;
  if (rule.canonicalTeam.toLowerCase().includes(lower)) return true;
  return rule.aliases.some(
    (alias) =>
      alias.name.toLowerCase().includes(lower) ||
      alias.team.toLowerCase().includes(lower),
  );
}

function AthleteOption({ match }: { match: RawNameMatch }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="font-medium">{match.name}</span>
      {match.canonicalTeam && (
        <span className="text-gray-400 text-xs truncate">
          {match.canonicalTeam}
        </span>
      )}
      <span className="text-gray-300 text-xs ml-auto shrink-0">
        {match.resultCount} result{match.resultCount === 1 ? "" : "s"}
      </span>
    </span>
  );
}

const emptyForm = {
  name: "",
  team: "",
  aliasName: "",
  aliasTeam: "",
  note: "",
};

function AddAliasForm() {
  const [form, setForm] = useState(emptyForm);

  const searchAthletes = useCallback(
    (query: string) => api.searchRawNames(query),
    [],
  );

  function setField(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <CollapsibleForm
      buttonLabel="+ Add Rule"
      title="New Alias Rule"
      submitLabel="Add Rule"
      onSubmit={async () => {
        await adminApi.addAlias({
          name: form.name.trim(),
          team: form.team.trim(),
          aliasName: form.aliasName.trim(),
          aliasTeam: form.aliasTeam.trim(),
          note: form.note.trim() || undefined,
        });
        setForm(emptyForm);
        window.location.reload();
      }}
    >
      <div className="grid grid-cols-2 gap-4">
        <fieldset className="space-y-2 border border-gray-200 rounded p-3 bg-white">
          <legend className="text-xs font-semibold text-blue-700 px-1">
            Canonical athlete
          </legend>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Name
            </label>
            <Combobox
              value={form.name}
              onChange={(val) => setField("name", val)}
              onSelect={(match: RawNameMatch) => {
                setField("name", match.name);
                setField("team", match.canonicalTeam ?? "");
              }}
              search={searchAthletes}
              itemKey={(match) => String(match.athleteId)}
              renderItem={(match) => <AthleteOption match={match} />}
              placeholder="Search by name…"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Team (canonical key)
            </label>
            <input
              required
              value={form.team}
              onChange={(event) => setField("team", event.target.value)}
              placeholder="filled from search"
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </fieldset>

        <fieldset className="space-y-2 border border-gray-200 rounded p-3 bg-white">
          <legend className="text-xs font-semibold text-gray-500 px-1">
            Alias athlete
          </legend>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Name
            </label>
            <Combobox
              value={form.aliasName}
              onChange={(val) => setField("aliasName", val)}
              onSelect={(match: RawNameMatch) => {
                setField("aliasName", match.name);
                setField("aliasTeam", match.canonicalTeam ?? "");
              }}
              search={searchAthletes}
              itemKey={(match) => String(match.athleteId)}
              renderItem={(match) => <AthleteOption match={match} />}
              placeholder="Search by name…"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Team (canonical key)
            </label>
            <input
              required
              value={form.aliasTeam}
              onChange={(event) => setField("aliasTeam", event.target.value)}
              placeholder="filled from search"
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </fieldset>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Note (optional)
        </label>
        <input
          value={form.note}
          onChange={(event) => setField("note", event.target.value)}
          placeholder="Why this alias was created"
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </CollapsibleForm>
  );
}

export default function AliasesPage() {
  const [rules, setRules] = useState<AthleteAliasRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api
      .getAthleteAliasRules()
      .then(setRules)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, []);

  const filtered = rules?.filter(
    (rule) => !search || matchesSearch(rule, search),
  );

  const { visible, sentinelRef, hasMore } = usePagedList(filtered ?? []);

  return (
    <div>
      <PageHeader
        title="Athlete Aliases"
        description={
          rules
            ? filtered?.length !== rules.length
              ? `${filtered?.length} of ${rules.length} rules`
              : `${rules.length} rule${rules.length === 1 ? "" : "s"}`
            : undefined
        }
      >
        <input
          type="search"
          placeholder="Filter by name or team…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-64 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </PageHeader>

      <div className="px-6 py-3 border-b border-gray-100">
        <AddAliasForm />
      </div>

      {rules === null && <LoadingState error={error} />}
      {filtered !== undefined && filtered.length === 0 && (
        <div className="p-6 text-sm text-gray-500">
          {search ? `No rules match "${search}".` : "No alias rules found."}
        </div>
      )}
      {filtered !== undefined && filtered.length > 0 && (
        <div className="divide-y divide-gray-100">
          {visible.map((rule) => (
            <div key={rule.id} className="px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="shrink-0 text-xs font-mono text-gray-400 pt-0.5">
                    #{rule.id}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <Link
                        to={
                          rule.athleteId
                            ? `/athlete/${rule.athleteId}`
                            : `/athlete?q=${encodeURIComponent(rule.name)}`
                        }
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {rule.name}
                      </Link>
                      <span className="text-sm text-gray-500">@</span>
                      <Link
                        to={`/team/${encodeURIComponent(rule.canonicalTeam)}`}
                        className="text-sm text-gray-700 hover:text-blue-600 hover:underline font-mono"
                      >
                        {rule.canonicalTeam}
                      </Link>
                      <Badge color="blue">canonical</Badge>
                    </div>
                    {rule.note && (
                      <p className="mt-0.5 text-xs text-gray-500 italic">
                        {rule.note}
                      </p>
                    )}
                    <div className="mt-2 space-y-1">
                      {rule.aliases.map((alias, idx) => (
                        <div
                          key={idx}
                          className="flex items-baseline gap-2 pl-4 border-l-2 border-gray-200"
                        >
                          <Link
                            to={`/athlete?q=${encodeURIComponent(alias.name)}`}
                            className="text-sm text-blue-600 hover:underline"
                          >
                            {alias.name}
                          </Link>
                          <span className="text-xs text-gray-400">@</span>
                          <Link
                            to={`/team/${encodeURIComponent(alias.team)}`}
                            className="text-sm text-gray-600 hover:text-blue-600 hover:underline font-mono"
                          >
                            {alias.team}
                          </Link>
                          <Badge>alias</Badge>
                        </div>
                      ))}
                      {rule.aliases.length === 0 && (
                        <p className="text-xs text-amber-600 pl-4">
                          No alias entries — rule has no effect
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <DeleteButton
                  onDelete={async () => {
                    await adminApi.removeAlias({
                      name: rule.name,
                      team: rule.canonicalTeam,
                    });
                    window.location.reload();
                  }}
                />
              </div>
            </div>
          ))}
          {hasMore && <div ref={sentinelRef} className="h-4" />}
        </div>
      )}
    </div>
  );
}
