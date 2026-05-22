import React, { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { api } from "@granfondo/api";
import type { AthleteEntry, AthleteResultRef } from "@granfondo/database/types";
import { Spinner } from "./EventList";
import { countryFlag } from "@granfondo/database/normalize";

type AthleteRow = {
  id: number;
  name: string;
  canonicalTeam: string | null;
  resultCount: number;
};

function tickDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
  });
}

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
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (debounce.current) {
      clearTimeout(debounce.current);
    }

    if (search.trim().length < 2) {
      setResults([]);
      return;
    }

    debounce.current = setTimeout(() => {
      api.searchAthletes(search.trim()).then((rows) => {
        setResults(rows.filter((r) => r.id !== excluded));
        if (userTyped.current) {
          setOpen(true);
        }
      });
    }, 250);
  }, [search, excluded]);

  return (
    <div ref={wrapRef} className="relative w-full sm:flex-1 min-w-0">
      <label
        className="block text-xs font-semibold mb-1.5 uppercase tracking-wide"
        style={{ color }}
      >
        {label}
      </label>
      <input
        value={search}
        onChange={(e) => {
          userTyped.current = true;
          setSearch(e.target.value);
          setOpen(true);
        }}
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
              onMouseDown={() => {
                onSelect(a);
                setSearch(a.name);
                setOpen(false);
              }}
            >
              <span className="font-medium text-slate-800">{a.name}</span>
              {a.canonicalTeam && (
                <span className="text-xs text-slate-400 truncate max-w-[120px]">
                  {a.canonicalTeam}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const COLORS = ["#3b82f6", "#f43f5e"];

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
    if (!aId) {
      setAData(null);
      return;
    }

    setALoading(true);
    api
      .getAthlete(aId)
      .then(setAData)
      .catch(() => setAData(null))
      .finally(() => setALoading(false));
  }, [aId]);

  useEffect(() => {
    if (!bId) {
      setBData(null);
      return;
    }

    setBLoading(true);
    api
      .getAthlete(bId)
      .then(setBData)
      .catch(() => setBData(null))
      .finally(() => setBLoading(false));
  }, [bId]);

  useEffect(() => {
    setAName(aData?.name ?? "");
  }, [aData]);
  useEffect(() => {
    setBName(bData?.name ?? "");
  }, [bData]);

  // Shared events
  const shared = useMemo(() => {
    if (!aData || !bData) {
      return [];
    }

    const bMap = new Map<string, AthleteResultRef>();
    for (const r of bData.results) {
      if (!r.dnf && !r.dns) {
        bMap.set(`${r.eventId}|${r.distance}`, r);
      }
    }

    const pairs: Array<{ a: AthleteResultRef; b: AthleteResultRef }> = [];
    for (const r of aData.results) {
      if (r.dnf || r.dns) {
        continue;
      }

      const key = `${r.eventId}|${r.distance}`;
      const match = bMap.get(key);
      if (match) {
        pairs.push({ a: r, b: match });
      }
    }

    return pairs.sort((x, y) => x.a.eventDate.localeCompare(y.a.eventDate));
  }, [aData, bData]);

  const sharedYears = useMemo(
    () =>
      [
        ...new Set(shared.map((p) => new Date(p.a.eventDate).getFullYear())),
      ].sort((a, b) => b - a),
    [shared],
  );
  const [selectedYear, setSelectedYear] = useState<number | "all">("all");
  useEffect(() => {
    if (sharedYears.length > 0 && window.innerWidth < 640) {
      setSelectedYear(sharedYears[0]!);
    }
  }, [sharedYears]);
  const filteredShared = useMemo(
    () =>
      selectedYear === "all"
        ? shared
        : shared.filter(
            (p) => new Date(p.a.eventDate).getFullYear() === selectedYear,
          ),
    [shared, selectedYear],
  );

  // Chart data
  const chartData = useMemo(
    () =>
      filteredShared.map((p) => ({
        dateMs: new Date(p.a.eventDate + "T12:00:00").getTime(),
        dateLabel: tickDate(new Date(p.a.eventDate + "T12:00:00").getTime()),
        eventName: p.a.eventName,
        a: p.a.pos || null,
        b: p.b.pos || null,
      })),
    [filteredShared],
  );

  const maxPos = useMemo(
    () => Math.max(...filteredShared.flatMap((p) => [p.a.pos, p.b.pos]), 10),
    [filteredShared],
  );

  const aWins = shared.filter((p) => p.a.pos < p.b.pos).length;
  const bWins = shared.filter((p) => p.b.pos < p.a.pos).length;

  interface TooltipItem {
    dataKey: string;
    value: number;
    payload: { eventName: string };
  }

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: TooltipItem[];
  }) => {
    if (!active || !payload?.length) {
      return null;
    }

    const row = payload[0]?.payload;
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2 text-xs">
        <p className="font-semibold text-slate-700 mb-1">{row.eventName}</p>
        {payload.map((p: TooltipItem, i: number) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span style={{ color: COLORS[i] }} className="font-bold">
              ●
            </span>
            <span className="text-slate-600">
              {i === 0 ? (aData?.name ?? "A") : (bData?.name ?? "B")}:
            </span>
            <span className="font-semibold text-slate-800">#{p.value}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-slate-400 hover:text-slate-600 transition-colors mb-4 inline-flex items-center gap-1"
      >
        ← Back
      </button>

      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-1">
          Head-to-Head
        </h1>
        <p className="text-sm text-slate-500">
          Compare two athletes across shared events
        </p>
      </div>

      {/* Athlete pickers */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8 items-end">
        <AthleteSearch
          label="Athlete A"
          color={COLORS[0]}
          excluded={bId || undefined}
          selectedName={aName || undefined}
          onSelect={(a) =>
            setSearchParams((p) => {
              const n = new URLSearchParams(p);
              n.set("a", String(a.id));
              return n;
            })
          }
        />
        <div className="text-slate-300 font-black text-2xl self-center pb-1 hidden sm:block">
          vs
        </div>
        <AthleteSearch
          label="Athlete B"
          color={COLORS[1]}
          excluded={aId || undefined}
          selectedName={bName || undefined}
          autoFocus={!!aId && !bId}
          onSelect={(a) =>
            setSearchParams((p) => {
              const n = new URLSearchParams(p);
              n.set("b", String(a.id));
              return n;
            })
          }
        />
      </div>

      {(aLoading || bLoading) && <Spinner />}

      {aData && bData && (
        <>
          {/* Hero cards */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            {[
              { data: aData, color: COLORS[0], wins: aWins },
              { data: bData, color: COLORS[1], wins: bWins },
            ].map(({ data, color, wins }, i) => {
              const finished = data.results.filter((r) => !r.dnf && !r.dns);
              const bestPos =
                finished.length > 0
                  ? Math.min(...finished.map((r) => r.pos))
                  : null;
              return (
                <div
                  key={i}
                  className="rounded-2xl border-2 p-4"
                  style={{
                    borderColor: color + "40",
                    background: color + "08",
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm">
                      {countryFlag(data.results[0]?.country ?? "")}
                    </span>
                    <Link
                      to={`/athlete/${data.id}`}
                      className="font-extrabold text-slate-900 hover:underline text-sm sm:text-base"
                    >
                      {data.name}
                    </Link>
                  </div>
                  {data.canonicalTeam && (
                    <p className="text-xs text-slate-400 mb-3 truncate">
                      {data.canonicalTeam}
                    </p>
                  )}
                  <div className="flex gap-3 text-center">
                    <div>
                      <div className="text-lg font-extrabold" style={{ color }}>
                        {wins}
                      </div>
                      <div className="text-[10px] text-slate-400 uppercase">
                        Wins
                      </div>
                    </div>
                    {bestPos && (
                      <div>
                        <div className="text-lg font-extrabold text-slate-700">
                          #{bestPos}
                        </div>
                        <div className="text-[10px] text-slate-400 uppercase">
                          Best
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="text-lg font-extrabold text-slate-700">
                        {finished.length}
                      </div>
                      <div className="text-[10px] text-slate-400 uppercase">
                        Races
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {shared.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="text-4xl mb-3">🤷</p>
              <p className="font-semibold text-slate-600">
                No shared events found
              </p>
            </div>
          ) : (
            <>
              {/* Chart */}
              {chartData.length >= 2 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-6">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                      Overall Trend
                    </h2>
                    <select
                      value={
                        selectedYear === "all" ? "all" : String(selectedYear)
                      }
                      onChange={(e) =>
                        setSelectedYear(
                          e.target.value === "all"
                            ? "all"
                            : Number(e.target.value),
                        )
                      }
                      className="px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-600"
                    >
                      <option value="all">All seasons</option>
                      {sharedYears.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart
                      data={chartData}
                      margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis
                        dataKey="dateMs"
                        type="number"
                        scale="time"
                        domain={["dataMin", "dataMax"]}
                        tickFormatter={tickDate}
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        reversed
                        domain={[maxPos + 2, 1]}
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                        tickFormatter={(v) => `#${v}`}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                        formatter={(_, __, i) =>
                          i === 0 ? aData.name : bData.name
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="a"
                        name="a"
                        stroke={COLORS[0]}
                        strokeWidth={2}
                        dot={{ r: 4, fill: COLORS[0], strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                        connectNulls={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="b"
                        name="b"
                        stroke={COLORS[1]}
                        strokeWidth={2}
                        dot={{ r: 4, fill: COLORS[1], strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                        connectNulls={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Table grouped by year */}
              {(() => {
                const byYear = shared.reduce<Record<number, typeof shared>>(
                  (acc, p) => {
                    const y = new Date(p.a.eventDate).getFullYear();
                    (acc[y] ??= []).push(p);
                    return acc;
                  },
                  {},
                );
                const years = Object.keys(byYear)
                  .map(Number)
                  .sort((a, b) => b - a);
                return years.map((year) => (
                  <div key={year} className="mb-8">
                    <h2 className="text-lg font-bold text-slate-800 mb-3">
                      {year}
                    </h2>
                    <div className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden bg-white">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-100">
                            <th className="px-4 py-2.5 text-left">Event</th>
                            <th className="px-4 py-2.5 text-left hidden sm:table-cell w-24">
                              Distance
                            </th>
                            <th
                              className="px-4 py-2.5 text-center w-24"
                              style={{ color: COLORS[0] }}
                            >
                              {aData.name.split(" ")[0]}
                            </th>
                            <th
                              className="px-4 py-2.5 text-center w-24"
                              style={{ color: COLORS[1] }}
                            >
                              {bData.name.split(" ")[0]}
                            </th>
                            <th className="px-4 py-2.5 text-center hidden md:table-cell w-16">
                              Winner
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {byYear[year]!.map((p, i) => {
                            const aWon = p.a.pos < p.b.pos;
                            const tie = p.a.pos === p.b.pos;
                            return (
                              <tr
                                key={i}
                                className="hover:bg-slate-50/60 transition-colors"
                              >
                                <td className="px-4 py-3">
                                  <Link
                                    to={`/event/${p.a.eventId}`}
                                    className="font-semibold text-slate-900 hover:text-blue-600 transition-colors"
                                  >
                                    {p.a.eventName}
                                  </Link>
                                  <div className="text-xs text-slate-400">
                                    {p.a.eventDate}
                                  </div>
                                  <div className="sm:hidden text-xs text-slate-400 mt-0.5">
                                    {p.a.distance}
                                  </div>
                                </td>
                                <td className="px-4 py-3 hidden sm:table-cell">
                                  <span className="text-xs text-slate-500">
                                    {p.a.distance}
                                  </span>
                                </td>
                                <td
                                  className={`px-4 py-3 text-center font-mono text-xs font-semibold ${aWon ? "text-blue-600" : "text-slate-500"}`}
                                >
                                  <div>#{p.a.pos}</div>
                                  <div className="text-slate-400 font-normal">
                                    {p.a.raceTime}
                                  </div>
                                </td>
                                <td
                                  className={`px-4 py-3 text-center font-mono text-xs font-semibold ${!aWon && !tie ? "text-rose-500" : "text-slate-500"}`}
                                >
                                  <div>#{p.b.pos}</div>
                                  <div className="text-slate-400 font-normal">
                                    {p.b.raceTime}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-center hidden md:table-cell text-sm">
                                  {tie ? "—" : aWon ? "🔵" : "🔴"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ));
              })()}
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
