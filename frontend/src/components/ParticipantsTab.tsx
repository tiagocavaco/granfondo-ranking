import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";
import { api } from "../api";
import type { StoredParticipant } from "@granfondo/database/types";
import { Spinner } from "./EventList";
import { normalizeName } from "@granfondo/database/normalize";

interface Props {
  eventId: number;
}

const DIST_PILL: Record<string, string> = {
  Granfondo: "bg-blue-50 text-blue-700",
  GranFondo: "bg-blue-50 text-blue-700",
  "BIG DAY": "bg-blue-50 text-blue-700",
  Clássica: "bg-blue-50 text-blue-700",
  Classica: "bg-blue-50 text-blue-700",
  Mediofondo: "bg-violet-50 text-violet-700",
  "HALF DAY": "bg-violet-50 text-violet-700",
  Etapa: "bg-violet-50 text-violet-700",
  Minifondo: "bg-emerald-50 text-emerald-700",
  "Time Trial": "bg-amber-50 text-amber-700",
  "TIME TRIAL": "bg-amber-50 text-amber-700",
};

export default function ParticipantsTab({ eventId }: Props) {
  const [participants, setParticipants] = useState<StoredParticipant[]>([]);
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
          const na = parseInt(a.bib, 10);
          const nb = parseInt(b.bib, 10);
          if (isNaN(na) && isNaN(nb)) {
            return 0;
          }

          if (isNaN(na)) {
            return -1;
          }

          if (isNaN(nb)) {
            return 1;
          }

          return na - nb;
        });
        setParticipants(sorted);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [eventId]);

  const distances = useMemo(
    () => [
      "all",
      ...Array.from(
        new Set(participants.map((p) => p.distance).filter(Boolean)),
      ).sort(),
    ],
    [participants],
  );

  const distanceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of participants) {
      if (p.distance) {
        counts[p.distance] = (counts[p.distance] ?? 0) + 1;
      }
    }

    return counts;
  }, [participants]);

  const categories = useMemo(
    () => [
      "all",
      ...Array.from(
        new Set(participants.map((p) => p.category).filter(Boolean)),
      ).sort(),
    ],
    [participants],
  );

  const filtered = useMemo(() => {
    const searchNorm = normalizeName(search);
    return participants.filter((p) => {
      const matchSearch =
        !search ||
        normalizeName(p.fullName).includes(searchNorm) ||
        p.team.toLowerCase().includes(search.toLowerCase()) ||
        p.bib.includes(search);
      const matchDist =
        distanceFilter === "all" || p.distance === distanceFilter;
      const matchCat =
        categoryFilter === "all" || p.category === categoryFilter;
      const matchGender = genderFilter === "all" || p.gender === genderFilter;
      return matchSearch && matchDist && matchCat && matchGender;
    });
  }, [participants, search, distanceFilter, categoryFilter, genderFilter]);

  const resetKey = `${search}|${distanceFilter}|${categoryFilter}|${genderFilter}`;
  const { visibleCount, sentinelRef } = useInfiniteScroll(
    filtered.length,
    resetKey,
  );

  if (loading) {
    return <Spinner />;
  }

  if (error) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p className="text-5xl mb-3">👥</p>
        <p className="font-semibold text-slate-600">
          Participants not available
        </p>
        <p className="text-sm mt-1 text-slate-400">
          Participant list is not available for this event.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <input
          type="text"
          placeholder="Search name, team or bib…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:flex-1 sm:min-w-48 sm:max-w-xs px-3.5 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {/* Mobile: counts in options */}
        <Select
          value={distanceFilter}
          onChange={setDistanceFilter}
          className="w-full sm:hidden"
        >
          <option value="all">
            All distances ({participants.length} participants)
          </option>
          {distances.slice(1).map((d) => (
            <option key={d} value={d}>
              {d} ({distanceCounts[d] ?? 0} participants)
            </option>
          ))}
        </Select>
        {/* Desktop: plain labels + separate counter */}
        <Select
          value={distanceFilter}
          onChange={setDistanceFilter}
          className="hidden sm:block sm:flex-none"
        >
          <option value="all">All distances</option>
          {distances.slice(1).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
        <Select
          value={categoryFilter}
          onChange={setCategoryFilter}
          className="flex-1 sm:flex-none"
        >
          <option value="all">All categories</option>
          {categories.slice(1).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select
          value={genderFilter}
          onChange={setGenderFilter}
          className="flex-1 sm:flex-none"
        >
          <option value="all">All genders</option>
          <option value="M">Men</option>
          <option value="F">Women</option>
        </Select>
        <span className="hidden sm:inline text-sm text-slate-500 sm:ml-auto">
          <span className="font-semibold text-slate-700">
            {filtered.length}
          </span>{" "}
          participants
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
              <th className="px-4 py-3 text-left hidden sm:table-cell">
                Category
              </th>
              <th className="px-4 py-3 text-center hidden sm:table-cell">
                Gender
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.slice(0, visibleCount).map((p, i) => (
              <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-slate-400">
                  {p.bib}
                </td>
                <td className="px-4 py-3 w-full max-w-0 overflow-hidden">
                  {p.athleteId > 0 ? (
                    <Link
                      to={`/athlete/${p.athleteId}`}
                      className="block hover:text-blue-600 transition-colors"
                    >
                      <div className="font-semibold text-slate-900 truncate">
                        {p.fullName}
                      </div>
                      {p.team && (
                        <div className="md:hidden text-xs text-slate-400 truncate mt-0.5">
                          {p.team}
                        </div>
                      )}
                    </Link>
                  ) : (
                    <>
                      <div className="font-semibold text-slate-900 truncate">
                        {p.fullName}
                      </div>
                      {p.team && (
                        <div className="md:hidden text-xs text-slate-400 truncate mt-0.5">
                          {p.team}
                        </div>
                      )}
                    </>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell whitespace-nowrap">
                  {p.team}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-center gap-0.5">
                    <span
                      className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold whitespace-nowrap ${
                        DIST_PILL[p.distance] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {p.distance}
                    </span>
                    {p.category && (
                      <span className="sm:hidden text-xs text-slate-400 whitespace-nowrap">
                        {p.category}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs hidden sm:table-cell">
                  {p.category}
                </td>
                <td className="px-4 py-3 text-center hidden sm:table-cell">
                  <span
                    className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                      p.gender === "F"
                        ? "bg-pink-50 text-pink-600"
                        : "bg-blue-50 text-blue-600"
                    }`}
                  >
                    {p.gender}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-slate-400">
            No participants found
          </div>
        )}
        {visibleCount < filtered.length && (
          <div
            ref={sentinelRef}
            className="px-4 py-3 text-xs text-slate-400 border-t border-slate-100 text-center"
          >
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
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`px-3.5 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
    >
      {children}
    </select>
  );
}
