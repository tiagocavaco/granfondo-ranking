import { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import type { AthleteResultRef } from "@granfondo/database/types";

const COLORS = ["#3b82f6", "#f43f5e"] as const;

type SharedPair = { a: AthleteResultRef; b: AthleteResultRef };

function tickDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

interface TooltipItem {
  dataKey: string;
  value: number;
  payload: { eventName: string };
}

function ChartTooltip({
  active, payload, aName, bName,
}: {
  active?: boolean;
  payload?: TooltipItem[];
  aName: string;
  bName: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-slate-700 mb-1">{row.eventName}</p>
      {payload.map((p, i) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span style={{ color: COLORS[i] }} className="font-bold">●</span>
          <span className="text-slate-600">{i === 0 ? aName : bName}:</span>
          <span className="font-semibold text-slate-800">#{p.value}</span>
        </div>
      ))}
    </div>
  );
}

interface Props {
  shared: SharedPair[];
  aName: string;
  bName: string;
}

export function HeadToHeadChart({ shared, aName, bName }: Props) {
  const sharedYears = useMemo(
    () => [...new Set(shared.map((p) => new Date(p.a.eventDate).getFullYear()))].sort((a, b) => b - a),
    [shared],
  );

  const [selectedYear, setSelectedYear] = useState<number | "all">("all");

  useEffect(() => {
    if (sharedYears.length > 0 && window.innerWidth < 640) {
      setSelectedYear(sharedYears[0]!);
    }
  }, [sharedYears]);

  const filtered = useMemo(
    () => selectedYear === "all" ? shared : shared.filter((p) => new Date(p.a.eventDate).getFullYear() === selectedYear),
    [shared, selectedYear],
  );

  const chartData = useMemo(
    () => filtered.map((p) => ({
      dateMs: new Date(p.a.eventDate + "T12:00:00").getTime(),
      dateLabel: tickDate(new Date(p.a.eventDate + "T12:00:00").getTime()),
      eventName: p.a.eventName,
      a: p.a.pos || null,
      b: p.b.pos || null,
    })),
    [filtered],
  );

  const maxPos = useMemo(
    () => Math.max(...filtered.flatMap((p) => [p.a.pos, p.b.pos]), 10),
    [filtered],
  );

  if (chartData.length < 2) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Overall Trend</h2>
        <select
          value={selectedYear === "all" ? "all" : String(selectedYear)}
          onChange={(e) => setSelectedYear(e.target.value === "all" ? "all" : Number(e.target.value))}
          className="px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-600"
        >
          <option value="all">All seasons</option>
          {sharedYears.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
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
          <Tooltip content={<ChartTooltip aName={aName} bName={bName} />} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(_, __, i) => (i === 0 ? aName : bName)}
          />
          <Line type="monotone" dataKey="a" name="a" stroke={COLORS[0]} strokeWidth={2}
            dot={{ r: 4, fill: COLORS[0], strokeWidth: 0 }} activeDot={{ r: 6 }} connectNulls={false} />
          <Line type="monotone" dataKey="b" name="b" stroke={COLORS[1]} strokeWidth={2}
            dot={{ r: 4, fill: COLORS[1], strokeWidth: 0 }} activeDot={{ r: 6 }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
