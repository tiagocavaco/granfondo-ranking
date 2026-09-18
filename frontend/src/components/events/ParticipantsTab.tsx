import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
import { api } from "@granfondo/api";
import type { StoredParticipant } from "@granfondo/database/types";
import { Spinner } from "../shared/Spinner";
import { ScrollSentinel } from "../shared/ScrollSentinel";
import { GenderBadge } from "../shared/GenderBadge";
import {
  normalizeName,
  normalizeDistance,
} from "@granfondo/database/normalize";
import { distBadgeClass } from "../../utils/distance";

interface Props {
  eventId: number;
}

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
          const bibA = parseInt(a.bib, 10);
          const bibB = parseInt(b.bib, 10);
          if (isNaN(bibA) && isNaN(bibB)) {
            return 0;
          }

          if (isNaN(bibA)) {
            return -1;
          }

          if (isNaN(bibB)) {
            return 1;
          }

          return bibA - bibB;
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
        <svg
          className="w-12 h-12 mx-auto mb-3 text-slate-700"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
        </svg>
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
          className="w-full sm:flex-1 sm:min-w-48 sm:max-w-xs px-3.5 py-2 text-sm rounded-xl input-dark focus:outline-none"
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
          <span className="font-semibold text-slate-300">
            {filtered.length}
          </span>{" "}
          participants
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/[0.07] bg-[#0c1628]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#060d1a] text-xs text-slate-500 uppercase tracking-wider border-b border-white/[0.06]">
              <th className="px-4 py-3 text-left w-16 hidden sm:table-cell">
                Bib
              </th>
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
          <tbody className="divide-y divide-white/[0.04]">
            {filtered.slice(0, visibleCount).map((p, i) => (
              <tr key={i} className="hover:bg-white/[0.03] transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-slate-600 hidden sm:table-cell">
                  {p.bib}
                </td>
                <td className="px-4 py-3 w-full max-w-0 overflow-hidden">
                  {p.athleteId > 0 ? (
                    <Link
                      to={`/athlete/${p.athleteId}`}
                      className="block hover:text-blue-300 transition-colors"
                    >
                      <div className="font-semibold text-slate-100 truncate">
                        {p.fullName}
                      </div>
                      {p.team && (
                        <div className="md:hidden text-xs text-slate-600 truncate mt-0.5">
                          {p.team}
                        </div>
                      )}
                    </Link>
                  ) : (
                    <>
                      <div className="font-semibold text-slate-100 truncate">
                        {p.fullName}
                      </div>
                      {p.team && (
                        <div className="md:hidden text-xs text-slate-600 truncate mt-0.5">
                          {p.team}
                        </div>
                      )}
                    </>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600 text-xs hidden md:table-cell whitespace-nowrap">
                  {p.team}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-center gap-0.5">
                    <span
                      className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold whitespace-nowrap ${distBadgeClass(
                        normalizeDistance(p.distance),
                      )}`}
                    >
                      {p.distance}
                    </span>
                    {p.category && (
                      <span className="sm:hidden text-xs text-slate-600 whitespace-nowrap">
                        {p.category}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600 text-xs hidden sm:table-cell">
                  {p.category}
                </td>
                <td className="px-4 py-3 text-center hidden sm:table-cell">
                  <GenderBadge gender={p.gender} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-slate-600">
            No participants found
          </div>
        )}
        <ScrollSentinel
          sentinelRef={sentinelRef}
          visible={visibleCount}
          total={filtered.length}
        />
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
      className={`px-3.5 py-2 text-sm rounded-xl input-dark focus:outline-none ${className}`}
    >
      {children}
    </select>
  );
}
