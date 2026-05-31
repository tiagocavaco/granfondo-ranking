import { useEffect, useState } from "react";
import { usePagedList } from "../lib/use-paged-list";
import Badge from "../components/Badge";
import {
  useParams,
  useNavigate,
  useSearchParams,
  Link,
} from "react-router-dom";
import {
  api,
  type AthleteAliasRule,
  type RawAthlete,
  type RawNameMatch,
  type ResultAssignment,
} from "@granfondo/api";

import DeleteButton from "../components/DeleteButton";
import { adminApi } from "../lib/admin-api";
import PageHeader from "../components/PageHeader";
import LoadingState from "../components/LoadingState";

function AthleteSearch() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [allAthletes, setAllAthletes] = useState<RawNameMatch[] | null>(null);

  useEffect(() => {
    api
      .listRawAthletes()
      .then(setAllAthletes)
      .catch(() => setAllAthletes([]));
  }, []);

  const lower = query.trim().toLowerCase();
  const filtered = allAthletes
    ? lower.length === 0
      ? allAthletes
      : allAthletes.filter(
          (athlete) =>
            athlete.nameLower.includes(lower) ||
            String(athlete.athleteId).includes(lower),
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

      {allAthletes === null && (
        <p className="text-xs text-gray-400">Loading…</p>
      )}
      {allAthletes !== null && filtered.length === 0 && (
        <p className="text-xs text-gray-500">
          No athletes found for "{query}".
        </p>
      )}
      {allAthletes !== null && filtered.length > 0 && (
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
                    Team
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Results
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {visible.map((match) => (
                  <tr
                    key={match.athleteId}
                    className="hover:bg-blue-50 cursor-pointer"
                    onClick={() => navigate(`/athlete/${match.athleteId}`)}
                  >
                    <td className="px-3 py-2 font-mono text-gray-400 text-xs">
                      {match.athleteId}
                    </td>
                    <td className="px-3 py-2 font-medium">{match.name}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">
                      {match.canonicalTeam ?? (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-400 text-xs">
                      {match.resultCount}
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

function AthleteOverrides({ athlete }: { athlete: RawAthlete }) {
  const [rules, setRules] = useState<AthleteAliasRule[] | null>(null);
  const [assignments, setAssignments] = useState<ResultAssignment[] | null>(
    null,
  );

  useEffect(() => {
    Promise.all([
      api.getAthleteAliasRulesForAthlete(athlete.name),
      api.getResultAssignmentsForAthlete(athlete.id),
    ])
      .then(([athleteRules, athleteAssignments]) => {
        setRules(athleteRules);
        setAssignments(athleteAssignments);
      })
      .catch(() => {
        setRules([]);
        setAssignments([]);
      });
  }, [athlete.id, athlete.name]);

  const aliasRules = rules ?? [];
  const resultAssignments = assignments ?? [];
  const loading = rules === null || assignments === null;

  if (loading) return null;
  if (aliasRules.length === 0 && resultAssignments.length === 0) return null;

  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
        manual overrides
      </h3>
      <div className="space-y-2">
        {aliasRules.map((rule) => (
          <div
            key={rule.id}
            className="bg-white border border-gray-200 rounded-md p-3 flex items-start justify-between gap-4"
          >
            <div className="text-sm space-y-1">
              <div className="text-xs font-medium text-blue-700 uppercase tracking-wider">
                Alias rule #{rule.id}
              </div>
              {rule.aliases.map((alias, idx) => (
                <div key={idx} className="text-gray-600">
                  <span className="font-medium">{alias.name}</span>
                  {" @ "}
                  <Link
                    to={`/team/${encodeURIComponent(alias.team)}`}
                    className="font-mono hover:text-blue-600 hover:underline"
                  >
                    {alias.team}
                  </Link>
                  <Badge>alias</Badge>
                </div>
              ))}
              {rule.note && (
                <div className="text-xs text-gray-400 italic">{rule.note}</div>
              )}
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
        ))}

        {resultAssignments.map((asgn) => (
          <div
            key={asgn.id}
            className="bg-white border border-gray-200 rounded-md p-3 flex items-start justify-between gap-4"
          >
            <div className="text-sm space-y-1">
              <div className="text-xs font-medium text-blue-700 uppercase tracking-wider">
                Result assignment #{asgn.id}
              </div>
              <div className="text-gray-700">
                <span className="font-mono text-gray-400 text-xs mr-1.5">
                  {asgn.eventId}
                </span>
                {asgn.eventName ?? ""}
                <span className="font-mono text-gray-500 ml-2">
                  · bib {asgn.bib}
                </span>
              </div>
              {asgn.note && (
                <div className="text-xs text-gray-400 italic">{asgn.note}</div>
              )}
            </div>
            <DeleteButton
              onDelete={async () => {
                await adminApi.removeAssignment({
                  eventId: asgn.eventId,
                  bib: asgn.bib,
                });
                window.location.reload();
              }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function AthleteDetail({ athlete }: { athlete: RawAthlete }) {
  const {
    visible: visibleResults,
    sentinelRef,
    hasMore,
  } = usePagedList(athlete.results);

  return (
    <div className="p-6 space-y-6">
      <AthleteOverrides athlete={athlete} />
      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          athletes row
        </h3>
        <div className="bg-white border border-gray-200 rounded-md p-4 font-mono text-sm space-y-1">
          <div>
            <span className="text-gray-400 mr-2">id</span>
            <span>{athlete.id}</span>
          </div>
          <div>
            <span className="text-gray-400 mr-2">name</span>
            <span>{athlete.name}</span>
          </div>
          <div>
            <span className="text-gray-400 mr-2">name_lower</span>
            <span className="text-gray-600">{athlete.nameLower}</span>
          </div>
          <div>
            <span className="text-gray-400 mr-2">canonical_team</span>
            <span>
              {athlete.canonicalTeam ?? (
                <span className="text-gray-400">null</span>
              )}
            </span>
          </div>
          <div>
            <span className="text-gray-400 mr-2">licences</span>
            {athlete.licences.length === 0 ? (
              <span className="text-gray-400">[]</span>
            ) : (
              <span>{athlete.licences.join(", ")}</span>
            )}
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          athlete_teams ({athlete.teams.length})
        </h3>
        {athlete.teams.length === 0 ? (
          <p className="text-sm text-gray-500">No team rows.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-md p-4 space-y-1">
            {athlete.teams.map((team) => (
              <div
                key={team.id}
                className="font-mono text-sm flex items-baseline gap-2"
              >
                <span className="text-gray-400">team_id: {team.id}</span>
                <Link
                  to={`/team/${encodeURIComponent(team.canonicalKey)}`}
                  className="text-blue-600 hover:underline"
                >
                  {team.canonicalKey}
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          athlete_categories ({athlete.categories.length})
        </h3>
        {athlete.categories.length === 0 ? (
          <p className="text-sm text-gray-500">No category rows.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {athlete.categories.map((cat) => (
              <Badge key={`${cat.year}-${cat.category}`} color="blue">
                {cat.year} · {cat.category}
              </Badge>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          athlete_results ({athlete.results.length})
        </h3>
        {athlete.results.length === 0 ? (
          <p className="text-sm text-gray-500">No result rows.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs border border-gray-200 rounded-md overflow-hidden">
                <thead className="bg-gray-50">
                  <tr>
                    {[
                      "Event",
                      "Date",
                      "Distance",
                      "Pos",
                      "GPos",
                      "Cat",
                      "Gender",
                      "Team",
                      "Time",
                      "Flags",
                    ].map((col) => (
                      <th
                        key={col}
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {visibleResults.map((result, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-mono text-gray-400 mr-1">
                          {result.eventId}
                        </span>
                        {result.eventName}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-gray-600">
                        {result.eventDate}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {result.distance}
                      </td>
                      <td className="px-3 py-2 font-mono">{result.pos}</td>
                      <td className="px-3 py-2 font-mono">
                        {result.genderPos}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {result.category}
                      </td>
                      <td className="px-3 py-2">{result.gender}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {result.team}
                      </td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap">
                        {result.raceTime}
                      </td>
                      <td className="px-3 py-2">
                        {result.dnf === 1 && <Badge color="red">DNF</Badge>}
                        {result.dns === 1 && <Badge color="gray">DNS</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && <div ref={sentinelRef} className="h-4" />}
          </>
        )}
      </section>
    </div>
  );
}

export default function RawAthletePage() {
  const { athleteId } = useParams<{ athleteId?: string }>();
  const [athlete, setAthlete] = useState<RawAthlete | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numericId = athleteId ? parseInt(athleteId, 10) : null;

  useEffect(() => {
    if (!numericId) return;
    setLoading(true);
    setAthlete(null);
    setNotFound(false);
    setError(null);
    api
      .getRawAthlete(numericId)
      .then((result) => {
        if (!result) setNotFound(true);
        else setAthlete(result);
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
          title="Raw Athlete"
          description="Search by name or jump to an ID"
        />
        <AthleteSearch />
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <PageHeader title={`Athlete #${numericId}`} />
        <LoadingState />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title={`Athlete #${numericId}`} />
        <LoadingState error={error} />
      </div>
    );
  }

  if (notFound) {
    return (
      <div>
        <PageHeader title={`Athlete #${numericId}`} />
        <div className="p-6 text-sm text-gray-500">
          Athlete {numericId} not found.{" "}
          <Link to="/athlete" className="text-blue-600 hover:underline">
            Search again
          </Link>
        </div>
      </div>
    );
  }

  if (!athlete) return null;

  return (
    <div>
      <PageHeader
        title={athlete.name}
        description={`ID ${athlete.id} · ${athlete.results.length} result${athlete.results.length === 1 ? "" : "s"}`}
      >
        <Link
          to="/athlete"
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          ← Search
        </Link>
      </PageHeader>
      <AthleteDetail athlete={athlete} />
    </div>
  );
}
