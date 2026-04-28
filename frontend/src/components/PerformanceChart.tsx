import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip,
} from "recharts";
import type { AthleteResultRef } from "@granfondo/database/types";
import { canonDist, distDotColor } from "../utils/distance";

type FlatPoint = {
  dateMs: number;
  pos: number;
  dist: string;
  eventName: string;
  finisherCount: number;
};

function tickDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

interface Props { results: AthleteResultRef[] }

export default function PerformanceChart({ results }: Props) {
  const finished = results.filter((r) => !r.dnf && !r.dns && r.pos > 0);
  if (finished.length < 2) return null;

  const flat: FlatPoint[] = finished
    .map((r) => ({
      dateMs:        new Date(r.eventDate + "T12:00:00").getTime(),
      pos:           r.pos,
      dist:          canonDist(r.distance),
      eventName:     r.eventName,
      finisherCount: r.finisherCount,
    }))
    .sort((a, b) => a.dateMs - b.dateMs);

  const posSorted = flat.map((p) => p.pos).sort((a, b) => a - b);
  const p90 = posSorted[Math.floor(posSorted.length * 0.9)] ?? posSorted[posSorted.length - 1] ?? 10;
  const maxPos = Math.max(p90, 10);

  const uniqueDists = [...new Set(flat.map((p) => p.dist))];

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const pt: FlatPoint = payload[0]?.payload;
    if (!pt) return null;
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2 text-xs">
        <p className="font-semibold text-slate-700 mb-1">{pt.eventName}</p>
        <div className="flex items-center gap-2">
          <span style={{ color: distDotColor(pt.dist) }} className="font-bold">●</span>
          <span className="text-slate-600">{pt.dist}:</span>
          <span className="font-semibold text-slate-800">#{pt.pos}</span>
          <span className="text-slate-400">/ {pt.finisherCount}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-8">
      <h2 className="text-sm font-bold text-slate-700 mb-1 uppercase tracking-wide">Performance Trend</h2>

      {/* Legend */}
      <div className="flex gap-3 mb-3 flex-wrap">
        {uniqueDists.map((d) => (
          <span key={d} className="flex items-center gap-1 text-xs text-slate-500">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: distDotColor(d) }} />
            {d}
          </span>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={flat} margin={{ top: 20, right: 8, left: -20, bottom: 0 }}>
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
          <Line
            type="monotone"
            dataKey="pos"
            stroke="#cbd5e1"
            strokeWidth={1.5}
            dot={(props: any) => {
              const { cx, cy, payload } = props;
              const pos: number = payload.pos;
              if (pos == null || cx == null || cy == null) return <g key={props.key} />;
              const color = distDotColor(payload.dist);
              const label = pos <= 3
                ? (pos === 1 ? "🥇" : pos === 2 ? "🥈" : "🥉")
                : `#${pos}`;
              const fontSize = pos <= 3 ? 13 : 9;
              return (
                <g key={props.key}>
                  <circle cx={cx} cy={cy} r={4} fill={color} strokeWidth={0} />
                  <text x={cx} y={cy - 10} textAnchor="middle" fontSize={fontSize} fontWeight={600} fill={pos <= 3 ? undefined : color}>{label}</text>
                </g>
              );
            }}
            activeDot={(props: any) => {
              const color = distDotColor(props.payload?.dist);
              return <circle key={props.key} cx={props.cx} cy={props.cy} r={6} fill={color} strokeWidth={0} />;
            }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
