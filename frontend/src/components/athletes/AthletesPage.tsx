import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { api } from "@granfondo/api";
import { Spinner } from "../shared/Spinner";
import { usePageTitle } from "../../hooks/usePageTitle";
import { countryFlag } from "@granfondo/database/normalize";

type AthleteRow = {
  id: number;
  name: string;
  canonicalTeam: string | null;
  resultCount: number;
  country: string;
};

export default function AthletesPage() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<AthleteRow[]>([]);
  const [topAthletes, setTopAthletes] = useState<AthleteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [topLoading, setTopLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  usePageTitle("Athletes");

  useEffect(() => {
    inputRef.current?.focus();
    api
      .getTopAthletes(50)
      .then(setTopAthletes)
      .catch(() => {})
      .finally(() => setTopLoading(false));
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const term = search.trim();
    if (term.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      setLoading(true);
      api
        .searchAthletes(term)
        .then((rows) => {
          setResults(rows);
          setSearched(true);
        })
        .catch(() => {
          setResults([]);
          setSearched(true);
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [search]);

  const displayList = searched ? results : topAthletes;
  const isShowingTop = !searched;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <div className="text-[10px] font-black tracking-[0.3em] text-blue-500/70 uppercase mb-2">
          Portuguese Granfondo Series
        </div>
        <h1 className="font-display font-bold text-4xl sm:text-5xl text-white tracking-wide uppercase mb-1">
          Athletes
        </h1>
        <p className="text-sm text-slate-600">
          Search by name or team, or browse the most active racers
        </p>
      </div>

      <div className="relative mb-6">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg
            className="w-4 h-4 text-slate-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </span>
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or team…"
          className="w-full pl-10 pr-4 py-3 rounded-xl input-dark text-sm font-medium placeholder-slate-600 focus:outline-none transition"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-lg leading-none"
          >
            ×
          </button>
        )}
      </div>

      {(loading || (topLoading && isShowingTop)) && <Spinner />}

      {!loading && searched && results.length === 0 && (
        <div className="text-center py-16">
          <p className="font-semibold text-slate-600">
            No athletes found for "{search}"
          </p>
        </div>
      )}

      {!loading && !(topLoading && isShowingTop) && displayList.length > 0 && (
        <>
          {isShowingTop && (
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-3 px-1">
              Most active athletes
            </p>
          )}
          <div className="bg-[#0c1628] rounded-2xl border border-white/[0.07] overflow-hidden">
            <ul className="divide-y divide-white/[0.04]">
              {displayList.map((a, idx) => {
                return (
                  <li key={a.id} className="group">
                    <Link
                      to={`/athlete/${a.id}`}
                      style={{ animationDelay: `${Math.min(idx * 40, 350)}ms` }}
                      className="animate-in flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold group-hover:text-blue-300 transition-colors truncate flex items-center gap-1.5 text-slate-100">
                          {a.country && (
                            <span className="text-sm shrink-0">
                              {countryFlag(a.country)}
                            </span>
                          )}
                          {a.name}
                        </div>
                        {a.canonicalTeam && (
                          <div className="text-xs text-slate-600 truncate mt-0.5">
                            {a.canonicalTeam}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 ml-2 text-xs tabular-nums">
                        <span className="font-bold text-slate-500">
                          {a.resultCount}
                        </span>
                        <span className="text-slate-700 ml-1">
                          {a.resultCount === 1 ? "race" : "races"}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {searched && results.length === 50 && (
              <div className="px-5 py-2.5 text-xs text-slate-600 border-t border-white/[0.06] text-center">
                Showing top 50 — refine your search for more specific results
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
