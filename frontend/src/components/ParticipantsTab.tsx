import { useEffect, useState, useMemo } from "react";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";
import { api } from "../api";
import type { ApiAthlete } from "../types";
import { Spinner } from "./EventList";

interface Props {
  eventId: number;
}

const DIST_PILL: Record<string, string> = {
  Granfondo: "bg-blue-50 text-blue-700",
  GranFondo: "bg-blue-50 text-blue-700",
  Mediofondo: "bg-violet-50 text-violet-700",
  Minifondo: "bg-emerald-50 text-emerald-700",
  "TIME TRIAL": "bg-amber-50 text-amber-700",
  "BIG DAY": "bg-blue-50 text-blue-700",
  "HALF DAY": "bg-violet-50 text-violet-700",
  "Clássica": "bg-blue-50 text-blue-700",
  "Etapa": "bg-violet-50 text-violet-700",
};

export default function ParticipantsTab({ eventId }: Props) {
  const [participants, setParticipants] = useState<ApiAthlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [distanceFilter, setDistanceFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getParticipants(eventId)
      .then((data) => {
        // Sort by bib: unassigned (blank) first, then numeric ascending
        const sorted = [...data].sort((a, b) => {
          const na = parseInt(a.dorsal, 10);
          const nb = parseInt(b.dorsal, 10);
          if (isNaN(na) && isNaN(nb)) return 0;
          if (isNaN(na)) return -1;
          if (isNaN(nb)) return 1;
          return na - nb;
        });
        setParticipants(sorted);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [eventId]);

  const distances = useMemo(
    () => ["all", ...Array.from(new Set(participants.map((p) => p.percurso).filter(Boolean))).sort()],
    [participants]
  );

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(participants.map((p) => p.escalao).filter(Boolean))).sort()],
    [participants]
  );

  const filtered = useMemo(() => participants.filter((p) => {
    const matchSearch =
      !search ||
      p.nomecompleto.toLowerCase().includes(search.toLowerCase()) ||
      (p.equipa ?? "").toLowerCase().includes(search.toLowerCase()) ||
      p.dorsal.includes(search);
    const matchDist = distanceFilter === "all" || p.percurso === distanceFilter;
    const matchCat = categoryFilter === "all" || p.escalao === categoryFilter;
    const matchGender = genderFilter === "all" || p.sexo === genderFilter;
    return matchSearch && matchDist && matchCat && matchGender;
  }), [participants, search, distanceFilter, categoryFilter, genderFilter]);

  const resetKey = `${search}|${distanceFilter}|${categoryFilter}|${genderFilter}`;
  const { visibleCount, sentinelRef } = useInfiniteScroll(filtered.length, resetKey);

  if (loading) return <Spinner />;

  if (error)
    return (
      <div className="text-center py-16 text-slate-400">
        <p className="text-5xl mb-3">👥</p>
        <p className="font-semibold text-slate-600">Participants not available</p>
        <p className="text-sm mt-1 text-slate-400">No participant data yet for this event.</p>
      </div>
    );

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <input
          type="text"
          placeholder="Search name, team or bib…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 max-w-xs px-3.5 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <Select value={distanceFilter} onChange={setDistanceFilter}>
          <option value="all">All distances</option>
          {distances.slice(1).map((d) => <option key={d} value={d}>{d}</option>)}
        </Select>
        <Select value={categoryFilter} onChange={setCategoryFilter}>
          <option value="all">All categories</option>
          {categories.slice(1).map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select value={genderFilter} onChange={setGenderFilter}>
          <option value="all">All genders</option>
          <option value="M">Men</option>
          <option value="F">Women</option>
        </Select>
        <span className="text-sm text-slate-500 ml-auto">
          <span className="font-semibold text-slate-700">{filtered.length}</span> of {participants.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-100">
              <th className="px-4 py-3 text-left w-16">Bib</th>
              <th className="px-4 py-3 text-left">Athlete</th>
              <th className="px-4 py-3 text-left hidden md:table-cell">Team</th>
              <th className="px-4 py-3 text-left">Distance</th>
              <th className="px-4 py-3 text-left hidden sm:table-cell">Category</th>
              <th className="px-4 py-3 text-center hidden sm:table-cell">G</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.slice(0, visibleCount).map((p, i) => (
              <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-slate-400">{p.dorsal}</td>
                <td className="px-4 py-3 font-semibold text-slate-900">{p.nomecompleto}</td>
                <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell max-w-[160px] truncate">
                  {p.equipa}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${
                      DIST_PILL[p.percurso] ?? "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {p.percurso}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs hidden sm:table-cell">{p.escalao}</td>
                <td className="px-4 py-3 text-center hidden sm:table-cell">
                  <span
                    className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                      p.sexo === "F"
                        ? "bg-pink-50 text-pink-600"
                        : "bg-blue-50 text-blue-600"
                    }`}
                  >
                    {p.sexo}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-slate-400">No participants found</div>
        )}
        {visibleCount < filtered.length && (
          <div ref={sentinelRef} className="px-4 py-3 text-xs text-slate-400 border-t border-slate-100 text-center">
            Showing {visibleCount} of {filtered.length}…
          </div>
        )}
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3.5 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {children}
    </select>
  );
}
