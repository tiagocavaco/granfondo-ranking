import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Spinner } from "./EventList";
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

  useEffect(() => {
    inputRef.current?.focus();
    api
      .getTopAthletes(30)
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
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 mb-1">
          Athletes
        </h1>
        <p className="text-sm text-slate-500">
          Search by name or team, or browse the most active racers
        </p>
      </div>

      <div className="relative mb-6">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-base pointer-events-none">
          🔍
        </span>
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or team…"
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white shadow-sm text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-lg leading-none"
          >
            ×
          </button>
        )}
      </div>

      {(loading || (topLoading && isShowingTop)) && <Spinner />}

      {!loading && searched && results.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <p className="text-4xl mb-3">🤷</p>
          <p className="font-semibold text-slate-600">
            No athletes found for "{search}"
          </p>
        </div>
      )}

      {!loading && !(topLoading && isShowingTop) && displayList.length > 0 && (
        <>
          {isShowingTop && (
            <p className="text-xs text-slate-400 mb-2 px-1">
              Most active athletes
            </p>
          )}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <ul className="divide-y divide-slate-100">
              {displayList.map((a) => (
                <li key={a.id} className="group">
                  <Link
                    to={`/athlete/${a.id}`}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-blue-50/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors truncate flex items-center gap-1.5">
                        {a.country && (
                          <span className="text-sm shrink-0">
                            {countryFlag(a.country)}
                          </span>
                        )}
                        {a.name}
                      </div>
                      {a.canonicalTeam && (
                        <div className="text-xs text-slate-500 truncate mt-0.5">
                          {a.canonicalTeam}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 ml-4 text-xs font-semibold text-slate-400">
                      {a.resultCount} {a.resultCount === 1 ? "race" : "races"}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {searched && results.length === 50 && (
              <div className="px-5 py-2.5 text-xs text-slate-400 border-t border-slate-100 text-center">
                Showing top 50 — refine your search for more specific results
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
