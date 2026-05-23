import React, { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "@granfondo/api";
import type { AthleteEntry, AthleteResultRef } from "@granfondo/database/types";
import { Spinner } from "../shared/Spinner";
import { ComparisonHeroCard } from "./ComparisonHeroCard";
import { HeadToHeadChart } from "./HeadToHeadChart";
import { SharedEventsTable } from "./SharedEventsTable";

type AthleteRow = {
  id: number;
  name: string;
  canonicalTeam: string | null;
  resultCount: number;
};

function AthleteSearch({
  label,
  color,
  excluded,
  onSelect,
  selectedName,
  autoFocus,
}: {
  label: string;
  color: string;
  excluded?: number;
  onSelect: (a: AthleteRow) => void;
  selectedName?: string;
  autoFocus?: boolean;
}) {
  const [search, setSearch] = useState(selectedName ?? "");
  const userTyped = useRef(false);

  useEffect(() => {
    userTyped.current = false;
    setSearch(selectedName ?? "");
  }, [selectedName]);

  const [results, setResults] = useState<AthleteRow[]>([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (search.trim().length < 2) { setResults([]); return; }
    debounce.current = setTimeout(() => {
      api.searchAthletes(search.trim()).then((rows) => {
        setResults(rows.filter((r) => r.id !== excluded));
        if (userTyped.current) setOpen(true);
      });
    }, 250);
  }, [search, excluded]);

  return (
    <div ref={wrapRef} className="relative w-full sm:flex-1 min-w-0">
      <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color }}>
        {label}
      </label>
      <input
        value={search}
        onChange={(e) => { userTyped.current = true; setSearch(e.target.value); setOpen(true); }}
        placeholder="Search athlete…"
        autoFocus={autoFocus}
        className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:border-transparent shadow-sm"
        style={{ "--tw-ring-color": color } as React.CSSProperties}
        onFocus={() => results.length > 0 && setOpen(true)}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
          {results.map((a) => (
            <li
              key={a.id}
              className="px-4 py-2.5 text-sm cursor-pointer hover:bg-slate-50 flex items-center justify-between gap-2"
              onMouseDown={() => { onSelect(a); setSearch(a.name); setOpen(false); }}
            >
              <span className="font-medium text-slate-800">{a.name}</span>
              {a.canonicalTeam && (
                <span className="text-xs text-slate-400 truncate max-w-[120px]">{a.canonicalTeam}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const COLORS = ["#3b82f6", "#f43f5e"] as const;

export default function ComparisonPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const aId = Number(searchParams.get("a") ?? 0);
  const bId = Number(searchParams.get("b") ?? 0);

  const [aData, setAData] = useState<AthleteEntry | null>(null);
  const [bData, setBData] = useState<AthleteEntry | null>(null);
  const [aLoading, setALoading] = useState(false);
  const [bLoading, setBLoading] = useState(false);
  const [aName, setAName] = useState("");
  const [bName, setBName] = useState("");

  useEffect(() => {
    if (!aId) { setAData(null); return; }
    setALoading(true);
    api.getAthlete(aId).then(setAData).catch(() => setAData(null)).finally(() => setALoading(false));
  }, [aId]);

  useEffect(() => {
    if (!bId) { setBData(null); return; }
    setBLoading(true);
    api.getAthlete(bId).then(setBData).catch(() => setBData(null)).finally(() => setBLoading(false));
  }, [bId]);

  useEffect(() => { setAName(aData?.name ?? ""); }, [aData]);
  useEffect(() => { setBName(bData?.name ?? ""); }, [bData]);

  const shared = useMemo(() => {
    if (!aData || !bData) return [];
    const bMap = new Map<string, AthleteResultRef>();
    for (const r of bData.results) {
      if (!r.dnf && !r.dns) bMap.set(`${r.eventId}|${r.distance}`, r);
    }
    const pairs: Array<{ a: AthleteResultRef; b: AthleteResultRef }> = [];
    for (const r of aData.results) {
      if (r.dnf || r.dns) continue;
      const match = bMap.get(`${r.eventId}|${r.distance}`);
      if (match) pairs.push({ a: r, b: match });
    }
    return pairs.sort((x, y) => x.a.eventDate.localeCompare(y.a.eventDate));
  }, [aData, bData]);

  const aWins = shared.filter((p) => p.a.pos < p.b.pos).length;
  const bWins = shared.filter((p) => p.b.pos < p.a.pos).length;

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-slate-400 hover:text-slate-600 transition-colors mb-4 inline-flex items-center gap-1"
      >
        ← Back
      </button>

      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-1">Head-to-Head</h1>
        <p className="text-sm text-slate-500">Compare two athletes across shared events</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-8 items-end">
        <AthleteSearch
          label="Athlete A"
          color={COLORS[0]}
          excluded={bId || undefined}
          selectedName={aName || undefined}
          onSelect={(a) => setSearchParams((p) => { const n = new URLSearchParams(p); n.set("a", String(a.id)); return n; })}
        />
        <div className="text-slate-300 font-black text-2xl self-center pb-1 hidden sm:block">vs</div>
        <AthleteSearch
          label="Athlete B"
          color={COLORS[1]}
          excluded={aId || undefined}
          selectedName={bName || undefined}
          autoFocus={!!aId && !bId}
          onSelect={(a) => setSearchParams((p) => { const n = new URLSearchParams(p); n.set("b", String(a.id)); return n; })}
        />
      </div>

      {(aLoading || bLoading) && <Spinner />}

      {aData && bData && (
        <>
          <div className="grid grid-cols-2 gap-4 mb-8">
            <ComparisonHeroCard data={aData} color={COLORS[0]} wins={aWins} />
            <ComparisonHeroCard data={bData} color={COLORS[1]} wins={bWins} />
          </div>

          {shared.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="text-4xl mb-3">🤷</p>
              <p className="font-semibold text-slate-600">No shared events found</p>
            </div>
          ) : (
            <>
              <HeadToHeadChart shared={shared} aName={aData.name} bName={bData.name} />
              <SharedEventsTable shared={shared} aName={aData.name} bName={bData.name} />
            </>
          )}
        </>
      )}

      {aData && !bData && !bLoading && (
        <div className="text-center py-12 text-slate-400 text-sm">
          Select a second athlete to compare
        </div>
      )}
      {!aData && !aLoading && (
        <div className="text-center py-12 text-slate-400 text-sm">
          Search for two athletes above to get started
        </div>
      )}
    </div>
  );
}
