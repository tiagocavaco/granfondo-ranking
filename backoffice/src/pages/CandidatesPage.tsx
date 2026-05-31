import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import LoadingState from "../components/LoadingState";
import Badge from "../components/Badge";

type AthleteRef = {
  id: number;
  name: string;
  team: string;
  licences: string[];
  results: number;
  category: string;
  years: string;
};

type SplitCandidate = {
  confidence: number;
  reason: string;
  bestPos: number;
  keep: AthleteRef;
  absorb: AthleteRef;
  status: "pending" | "applied" | "rejected";
};

type TeamAliasCandidate = {
  fromKey: string;
  toKey: string;
  score: number;
  reason?: string;
};

type Tab = "splits" | "team-aliases";
type SplitFilter = "pending" | "applied" | "rejected";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json() as Promise<T>;
}

function ConfidencePip({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    value >= 0.7
      ? "bg-green-500"
      : value >= 0.5
        ? "bg-amber-400"
        : "bg-red-400";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 tabular-nums">{pct}%</span>
    </div>
  );
}

function AthleteCard({
  athlete,
  label,
}: {
  athlete: AthleteRef;
  label: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
        {label}
      </div>
      <a
        href={`/athlete/${athlete.id}`}
        className="font-medium text-blue-600 hover:underline text-sm"
      >
        {athlete.name}
      </a>
      <div className="text-xs text-gray-500 mt-0.5 space-y-0.5">
        <div>
          {athlete.team || <span className="text-gray-300">no team</span>}
        </div>
        <div>
          {athlete.category} · {athlete.years} · {athlete.results} result
          {athlete.results === 1 ? "" : "s"}
        </div>
        {athlete.licences.length > 0 && (
          <div className="font-mono">{athlete.licences.join(", ")}</div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: SplitCandidate["status"] }) {
  const color =
    status === "applied" ? "green" : status === "pending" ? "amber" : "gray";
  return <Badge color={color}>{status}</Badge>;
}

function SplitsTab() {
  const [candidates, setCandidates] = useState<SplitCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SplitFilter>("pending");
  const [search, setSearch] = useState("");

  useEffect(() => {
    Promise.all([
      fetchJson<Omit<SplitCandidate, "status">[]>("/api/candidates/splits"),
      fetchJson<Omit<SplitCandidate, "status">[]>(
        "/api/candidates/splits-applied",
      ),
      fetchJson<Omit<SplitCandidate, "status">[]>(
        "/api/candidates/splits-rejected",
      ),
    ])
      .then(([pending, applied, rejected]) => {
        setCandidates([
          ...pending.map((c) => ({ ...c, status: "pending" as const })),
          ...applied.map((c) => ({ ...c, status: "applied" as const })),
          ...rejected.map((c) => ({ ...c, status: "rejected" as const })),
        ]);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, []);

  if (candidates === null) return <LoadingState error={error} />;

  const counts = {
    pending: candidates.filter((c) => c.status === "pending").length,
    applied: candidates.filter((c) => c.status === "applied").length,
    rejected: candidates.filter((c) => c.status === "rejected").length,
  };

  const filtered = candidates.filter((c) => {
    if (c.status !== filter) return false;
    if (!search) return true;
    const lower = search.toLowerCase();
    return (
      c.keep.name.toLowerCase().includes(lower) ||
      c.absorb.name.toLowerCase().includes(lower) ||
      c.keep.team.toLowerCase().includes(lower) ||
      c.absorb.team.toLowerCase().includes(lower) ||
      String(c.keep.id).includes(lower) ||
      String(c.absorb.id).includes(lower)
    );
  });

  const filterBtn = (value: SplitFilter, count: number) => {
    const active = filter === value;
    return (
      <button
        onClick={() => setFilter(value)}
        className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
          active ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
        }`}
      >
        {value.charAt(0).toUpperCase() + value.slice(1)}
        <span
          className={`ml-1.5 text-xs ${active ? "text-gray-300" : "text-gray-400"}`}
        >
          {count}
        </span>
      </button>
    );
  };

  return (
    <div>
      <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between gap-4">
        <div className="flex gap-1">
          {filterBtn("pending", counts.pending)}
          {filterBtn("applied", counts.applied)}
          {filterBtn("rejected", counts.rejected)}
        </div>
        <input
          type="search"
          placeholder="Filter by name, team, ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {filtered.length === 0 && (
        <div className="p-6 text-sm text-gray-500">
          {search ? `No matches for "${search}".` : `No ${filter} candidates.`}
        </div>
      )}

      <div className="divide-y divide-gray-100">
        {filtered.map((candidate, idx) => (
          <div key={idx} className="px-6 py-4">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-3">
                <ConfidencePip value={candidate.confidence} />
                <StatusBadge status={candidate.status} />
                {candidate.bestPos <= 10 && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">
                    top {candidate.bestPos}
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-3 italic">
              {candidate.reason}
            </p>
            <div className="grid grid-cols-2 gap-6">
              <AthleteCard athlete={candidate.keep} label="keep" />
              <AthleteCard athlete={candidate.absorb} label="absorb" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamAliasesTab() {
  const [candidates, setCandidates] = useState<TeamAliasCandidate[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchJson<TeamAliasCandidate[]>("/api/candidates/team-aliases")
      .then(setCandidates)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, []);

  if (candidates === null) return <LoadingState error={error} />;

  const filtered = candidates.filter(
    (c) =>
      !search ||
      c.fromKey.toLowerCase().includes(search.toLowerCase()) ||
      c.toKey.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between gap-4">
        <span className="text-sm text-gray-500">
          {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
        </span>
        <input
          type="search"
          placeholder="Filter…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {filtered.length === 0 && (
        <div className="p-6 text-sm text-gray-500">
          {search ? `No matches for "${search}".` : "No team alias candidates."}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="p-6 overflow-x-auto">
          <table className="min-w-full text-sm border border-gray-200 rounded-md overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  From
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  To
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Score
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reason
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filtered.map((candidate, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-sm">
                    {candidate.fromKey}
                  </td>
                  <td className="px-3 py-2 font-mono text-sm">
                    {candidate.toKey}
                  </td>
                  <td className="px-3 py-2">
                    <ConfidencePip value={candidate.score} />
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 italic">
                    {candidate.reason ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function CandidatesPage() {
  const [tab, setTab] = useState<Tab>("splits");

  const tabBtn = (value: Tab, label: string) => {
    const active = tab === value;
    return (
      <button
        onClick={() => setTab(value)}
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          active
            ? "border-gray-900 text-gray-900"
            : "border-transparent text-gray-500 hover:text-gray-700"
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div>
      <PageHeader
        title="Candidates"
        description="Pending merge and alias suggestions from the pipeline"
      />
      <div className="border-b border-gray-200 px-6 flex gap-1">
        {tabBtn("splits", "Split / Merge")}
        {tabBtn("team-aliases", "Team Aliases")}
      </div>
      {tab === "splits" && <SplitsTab />}
      {tab === "team-aliases" && <TeamAliasesTab />}
    </div>
  );
}
