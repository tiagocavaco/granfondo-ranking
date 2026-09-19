import { useEffect, useState, useMemo } from "react";
import { CatPosBadge } from "../shared/MedalBadge";
import { Link } from "react-router-dom";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
import { api } from "@granfondo/api";
import type {
  StoredEventResults,
  StoredResult,
  StoredDistanceResults,
  StoredDistance,
} from "@granfondo/database/types";
import {
  countryFlag,
  normalizeCountry as toISO2,
  normalizeName,
} from "@granfondo/database/normalize";
import { Spinner } from "../shared/Spinner";
import { ScrollSentinel } from "../shared/ScrollSentinel";
import { GenderBadge } from "../shared/GenderBadge";
import { posStyle, rankBorderAccent } from "../../utils/posStyle";
import { TeamLink } from "../shared/TeamLink";

interface Props {
  eventId: number;
  distances: StoredDistance[];
  resultsUrl: string;
}

export default function ResultsTab({ eventId, resultsUrl }: Props) {
  const [data, setData] = useState<StoredEventResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getResults(eventId)
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [eventId]);

  return (
    <div>
      {loading && <Spinner />}
      {error && (
        <div className="text-center py-16 text-slate-400">
          <svg
            className="w-12 h-12 mx-auto mb-3 text-slate-700"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z" />
          </svg>
          <p className="font-semibold text-slate-600 text-lg mb-4">
            Results not available yet
          </p>
          <a
            href={resultsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            View on official results page ↗
          </a>
        </div>
      )}
      {!loading && !error && data && data.distances.length > 0 && (
        <ResultsTable distances={data.distances} />
      )}
    </div>
  );
}

function ResultsTable({ distances }: { distances: StoredDistanceResults[] }) {
  const defaultDistId =
    distances.find((d) => d.name === "Granfondo")?.id ?? distances[0]?.id ?? "";

  const [activeDistId, setActiveDistId] = useState(defaultDistId);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");

  const activeDist =
    distances.find((d) => d.id === activeDistId) ?? distances[0];
  const results: StoredResult[] = activeDist?.results ?? [];

  const nationalitySummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of results) {
      if (r.dnf || r.dns) {
        continue;
      }

      const iso2 = toISO2(r.country);
      counts.set(iso2, (counts.get(iso2) ?? 0) + 1);
    }

    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [results]);

  const categories = useMemo(() => {
    const base =
      genderFilter === "all"
        ? results
        : results.filter((r) => r.gender === genderFilter);
    return [
      "all",
      ...Array.from(
        new Set(base.map((r) => r.category).filter(Boolean)),
      ).sort(),
    ];
  }, [results, genderFilter]);

  const catPosMap = useMemo(() => {
    const map = new WeakMap<StoredResult, number>();
    const byCategory = new Map<string, StoredResult[]>();
    for (const r of results) {
      if (r.dnf || r.dns || r.pos < 1 || !r.category) {
        continue;
      }

      if (!byCategory.has(r.category)) {
        byCategory.set(r.category, []);
      }

      byCategory.get(r.category)!.push(r);
    }

    for (const group of byCategory.values()) {
      group.sort((a, b) => a.pos - b.pos);
      group.forEach((r, i) => map.set(r, i + 1));
    }

    return map;
  }, [results]);

  const filtered = useMemo(() => {
    const searchNorm = normalizeName(search);
    return results.filter((r) => {
      const matchSearch =
        !search ||
        normalizeName(r.name).includes(searchNorm) ||
        r.team.toLowerCase().includes(search.toLowerCase()) ||
        r.bib.includes(search);
      const matchCat =
        categoryFilter === "all" || r.category === categoryFilter;
      const matchGender = genderFilter === "all" || r.gender === genderFilter;
      return matchSearch && matchCat && matchGender;
    });
  }, [results, search, categoryFilter, genderFilter]);

  const resetKey = `${activeDistId}|${search}|${categoryFilter}|${genderFilter}`;
  const { visibleCount, sentinelRef } = useInfiniteScroll(
    filtered.length,
    resetKey,
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
        <input
          type="text"
          placeholder="Search name, team, bib…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-48 px-3.5 py-2 text-sm rounded-xl input-dark focus:outline-none"
        />
        {distances.length > 1 && (
          <>
            {/* Mobile: counts in options */}
            <select
              value={activeDistId}
              onChange={(e) => {
                setActiveDistId(e.target.value);
                setCategoryFilter("all");
                setGenderFilter("all");
                setSearch("");
              }}
              className="w-full sm:hidden px-3.5 py-2 text-sm rounded-xl input-dark focus:outline-none"
            >
              {distances.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.finisherCount.toLocaleString()} finishers)
                </option>
              ))}
            </select>
            {/* Desktop: plain labels */}
            <select
              value={activeDistId}
              onChange={(e) => {
                setActiveDistId(e.target.value);
                setCategoryFilter("all");
                setGenderFilter("all");
                setSearch("");
              }}
              className="hidden sm:block px-3.5 py-2 text-sm rounded-xl input-dark focus:outline-none"
            >
              {distances.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </>
        )}
        <select
          value={genderFilter}
          onChange={(e) => {
            const nextGender = e.target.value;
            setGenderFilter(nextGender);
            if (categoryFilter !== "all") {
              const available = new Set(
                results
                  .filter(
                    (r) => nextGender === "all" || r.gender === nextGender,
                  )
                  .map((r) => r.category),
              );
              if (!available.has(categoryFilter)) {
                setCategoryFilter("all");
              }
            }
          }}
          className="flex-1 sm:flex-none px-3.5 py-2 text-sm rounded-xl input-dark focus:outline-none"
        >
          <option value="all" className="bg-[#0c1628]">
            All genders
          </option>
          <option value="M" className="bg-[#0c1628]">
            Men
          </option>
          <option value="F" className="bg-[#0c1628]">
            Women
          </option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="flex-1 sm:flex-none px-3.5 py-2 text-sm rounded-xl input-dark focus:outline-none"
        >
          <option value="all">All categories</option>
          {categories.slice(1).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="hidden sm:inline text-sm text-slate-500 sm:ml-auto">
          <span className="font-semibold text-slate-300">
            {filtered.length.toLocaleString()}
          </span>{" "}
          results
        </span>
      </div>

      {nationalitySummary.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {nationalitySummary.map(([iso2, count]) => (
            <span
              key={iso2}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-white/[0.06] text-slate-400 font-medium"
            >
              {countryFlag(iso2)} {count.toLocaleString()}
            </span>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-white/[0.07] bg-[#0c1628]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#060d1a] text-xs text-slate-500 uppercase tracking-wider border-b border-white/[0.06]">
              <th className="px-4 py-3 text-left w-14">Pos</th>
              <th className="px-4 py-3 text-left w-16 hidden sm:table-cell">
                Bib
              </th>
              <th className="px-4 py-3 text-left">Athlete</th>
              <th className="px-4 py-3 text-left hidden md:table-cell">Team</th>
              <th className="px-4 py-3 text-left hidden sm:table-cell w-40">
                Category
              </th>
              <th className="px-4 py-3 text-center hidden sm:table-cell w-20">
                Gender
              </th>
              <th className="px-4 py-3 text-right">Time</th>
              <th className="px-4 py-3 text-right hidden lg:table-cell">Gap</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {filtered.slice(0, visibleCount).map((r, i) => (
              <tr
                key={i}
                className={`transition-colors hover:bg-white/[0.03] ${
                  r.dnf || r.dns ? "opacity-40" : ""
                } ${r.pos <= 3 ? "bg-white/[0.02]" : ""}`}
              >
                <td
                  className={`py-3 pl-2 pr-4 ${r.dnf || r.dns ? "border-l-[3px] border-transparent" : rankBorderAccent(r.pos)}`}
                >
                  {r.dnf || r.dns ? (
                    <span className="text-xs text-slate-400 font-bold">
                      {r.dnf ? "DNF" : "DNS"}
                    </span>
                  ) : (
                    <span
                      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold ${posStyle(r.pos)}`}
                    >
                      {r.pos}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 hidden sm:table-cell">
                  {r.bib}
                </td>
                <td className="px-4 py-3 w-full max-w-0 overflow-hidden">
                  {r.athleteId ? (
                    <Link
                      to={`/athlete/${r.athleteId}`}
                      className="block font-semibold text-slate-100 hover:text-blue-300 transition-colors truncate"
                    >
                      <span className="mr-1.5 text-base" title={r.country}>
                        {countryFlag(r.country)}
                      </span>
                      {r.name}
                    </Link>
                  ) : (
                    <div className="font-semibold text-slate-100 truncate">
                      <span className="mr-1.5 text-base" title={r.country}>
                        {countryFlag(r.country)}
                      </span>
                      {r.name}
                    </div>
                  )}
                  {r.team && (
                    <TeamLink
                      team={r.team}
                      className="block text-xs text-slate-600 truncate mt-0.5 md:hidden hover:text-blue-400 transition-colors"
                    />
                  )}
                </td>
                <td className="px-4 py-3 text-xs hidden md:table-cell whitespace-nowrap">
                  {r.team && (
                    <TeamLink
                      team={r.team}
                      className="text-slate-600 hover:text-blue-400 transition-colors"
                    />
                  )}
                </td>
                <td className="px-4 py-3 text-xs hidden sm:table-cell">
                  {(() => {
                    const catPos = catPosMap.get(r);
                    return (
                      <div className="flex items-center gap-1 whitespace-nowrap">
                        <span className="text-slate-500">{r.category}</span>
                        {catPos !== undefined && catPos <= 4 && (
                          <CatPosBadge pos={catPos} />
                        )}
                      </div>
                    );
                  })()}
                </td>
                <td className="px-4 py-3 text-center hidden sm:table-cell">
                  <GenderBadge gender={r.gender} />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="font-mono text-xs font-semibold text-slate-300">
                    {r.raceTime}
                  </div>
                  {r.gap && r.gap !== "00:00:00" && (
                    <div className="font-mono text-xs text-slate-600 mt-0.5 lg:hidden">
                      {r.gap}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs text-slate-600 hidden lg:table-cell">
                  {r.gap && r.gap !== "00:00:00" ? r.gap : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-slate-600">
            No results found
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
