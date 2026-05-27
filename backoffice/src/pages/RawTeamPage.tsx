import { useEffect, useState } from "react";
import { usePagedList } from "../lib/use-paged-list";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, type RawTeam, type RawTeamSummary } from "@granfondo/api";
import DeleteButton from "../components/DeleteButton";
import { adminApi } from "../lib/admin-api";
import PageHeader from "../components/PageHeader";
import LoadingState from "../components/LoadingState";

function TeamSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [allTeams, setAllTeams] = useState<RawTeamSummary[] | null>(null);

  useEffect(() => {
    api.listRawTeams().then(setAllTeams).catch(() => setAllTeams([]));
  }, []);

  const lower = query.trim().toLowerCase();
  const filtered = allTeams
    ? lower.length === 0
      ? allTeams
      : allTeams.filter(
          (team) =>
            team.canonicalKey.includes(lower) ||
            String(team.id).includes(lower),
        )
    : [];

  const { visible, sentinelRef, hasMore } = usePagedList(filtered);

  return (
    <div className="p-6 space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Filter by key or ID
        </label>
        <input
          type="search"
          placeholder="Filter by key or ID…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
          className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {allTeams === null && <p className="text-xs text-gray-400">Loading…</p>}
      {allTeams !== null && filtered.length === 0 && (
        <p className="text-xs text-gray-500">No teams found for "{query}".</p>
      )}
      {allTeams !== null && filtered.length > 0 && (
        <>
          <div className="border border-gray-200 rounded-md overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Key
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {visible.map((team) => (
                  <tr
                    key={team.id}
                    className="hover:bg-blue-50 cursor-pointer"
                    onClick={() => navigate(`/team/${encodeURIComponent(team.canonicalKey)}`)}
                  >
                    <td className="px-3 py-2 font-mono text-gray-400 text-xs">
                      {team.id}
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {team.canonicalKey}
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

export default function RawTeamPage() {
  const { teamKey } = useParams<{ teamKey?: string }>();
  const [team, setTeam] = useState<RawTeam | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decodedKey = teamKey ? decodeURIComponent(teamKey) : null;

  const { visible: visibleAthletes, sentinelRef, hasMore } = usePagedList(
    team?.athletes ?? [],
  );

  useEffect(() => {
    if (!decodedKey) return;
    setLoading(true);
    setNotFound(false);
    setError(null);
    api
      .getRawTeam(decodedKey)
      .then((result) => {
        if (!result) setNotFound(true);
        else setTeam(result);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => setLoading(false));
  }, [decodedKey]);

  if (!decodedKey) {
    return (
      <div>
        <PageHeader
          title="Raw Team"
          description="Inspect underlying DB rows for a team"
        />
        <TeamSearch />
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <PageHeader title={decodedKey} />
        <LoadingState />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title={decodedKey} />
        <LoadingState error={error} />
      </div>
    );
  }

  if (notFound) {
    return (
      <div>
        <PageHeader title={decodedKey} />
        <div className="p-6 text-sm text-gray-500">
          Team "{decodedKey}" not found.{" "}
          <Link to="/team" className="text-blue-600 hover:underline">
            Search again
          </Link>
        </div>
      </div>
    );
  }

  if (!team) return null;

  return (
    <div>
      <PageHeader
        title={team.canonicalKey}
        description={`ID ${team.id} · ${team.athletes.length} athlete reference${team.athletes.length === 1 ? "" : "s"}`}
      >
        <Link to="/team" className="text-sm text-gray-500 hover:text-gray-900">
          ← Search
        </Link>
      </PageHeader>
      <div className="p-6 space-y-6">
        {/* teams row */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            teams row
          </h3>
          <div className="bg-white border border-gray-200 rounded-md p-4 font-mono text-sm space-y-1">
            <div>
              <span className="text-gray-400 mr-2">id</span>
              <span>{team.id}</span>
            </div>
            <div>
              <span className="text-gray-400 mr-2">canonical_key</span>
              <span>{team.canonicalKey}</span>
            </div>
            <div>
              <span className="text-gray-400 mr-2">alias_keys</span>
              {team.aliasKeys.length === 0 ? (
                <span className="text-gray-400">[]</span>
              ) : (
                <span>[{team.aliasKeys.join(", ")}]</span>
              )}
            </div>
          </div>
        </section>

        {/* alias_keys */}
        {team.aliasKeys.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              alias keys ({team.aliasKeys.length})
            </h3>
            <div className="bg-white border border-gray-200 rounded-md divide-y divide-gray-100">
              {team.aliasKeys.map((key) => (
                <div
                  key={key}
                  className="flex items-center justify-between px-4 py-2"
                >
                  <span className="font-mono text-sm text-gray-700">{key}</span>
                  <DeleteButton
                    onDelete={async () => {
                      await adminApi.removeTeamAlias({ from: key });
                      window.location.reload();
                    }}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* athlete_teams rows */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            athlete_teams rows ({team.athletes.length})
          </h3>
          {team.athletes.length === 0 ? (
            <p className="text-sm text-gray-500">No athlete team rows.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border border-gray-200 rounded-md overflow-hidden">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">
                      Name
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {visibleAthletes.map((athlete) => (
                    <tr key={athlete.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-gray-400 text-xs">
                        {athlete.id}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          to={`/athlete/${athlete.id}`}
                          className="text-blue-600 hover:underline"
                        >
                          {athlete.name}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {hasMore && <div ref={sentinelRef} className="h-4" />}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
