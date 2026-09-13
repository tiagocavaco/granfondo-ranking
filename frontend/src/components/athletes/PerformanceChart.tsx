import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import type { AthleteResultRef } from "@granfondo/database/types";
import { distDotColor } from "../../utils/distance";

type FlatPoint = {
  dateMs: number;
  pos: number;
  dist: string;
  eventName: string;
  finisherCount: number;
};

function tickDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
  });
}

const PODIUM_COLORS: Record<number, string> = { 1: "#fbbf24", 2: "#cbd5e1", 3: "#fb923c" };

interface Props {
  results: AthleteResultRef[];
}

export default function PerformanceChart({ results }: Props) {
  const finished = results.filter((r) => !r.dnf && !r.dns && r.pos > 0);
  if (finished.length < 2) {
    return null;
  }

  const years = useMemo(
    () =>
      [
        ...new Set(finished.map((r) => new Date(r.eventDate).getFullYear())),
      ].sort((a, b) => b - a),
    [finished.length],
  );
  const [selectedYear, setSelectedYear] = useState<number | "all">(() =>
    window.innerWidth >= 640 ? "all" : (years[0] ?? "all"),
  );

  const filteredFinished =
    selectedYear === "all"
      ? finished
      : finished.filter(
          (r) => new Date(r.eventDate).getFullYear() === selectedYear,
        );

  const flat: FlatPoint[] = filteredFinished
    .map((r) => ({
      dateMs: new Date(r.eventDate + "T12:00:00").getTime(),
      pos: r.pos,
      dist: r.distance,
      eventName: r.eventName,
      finisherCount: r.finisherCount,
    }))
    .sort((a, b) => a.dateMs - b.dateMs);

  const posSorted = flat.map((p) => p.pos).sort((a, b) => a - b);
  const p90 =
    posSorted[Math.floor(posSorted.length * 0.9)] ??
    posSorted[posSorted.length - 1] ??
    10;
  const maxPos = Math.max(p90, 10);

  const uniqueDists = [...new Set(flat.map((p) => p.dist))];

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: FlatPoint }>;
  }) => {
    if (!active || !payload?.length) return null;
    const point: FlatPoint = payload[0]?.payload;
    if (!point) return null;
    const isPodium = point.pos <= 3;

    return (
      <div className="bg-[#0c1628] border border-white/[0.12] rounded-xl shadow-2xl px-4 py-3 text-xs backdrop-blur-sm">
        <p className="font-bold text-slate-300 mb-2 text-[11px] uppercase tracking-wide">{point.eventName}</p>
        <div className="flex items-center gap-2.5">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: distDotColor(point.dist), boxShadow: `0 0 6px ${distDotColor(point.dist)}` }}
          />
          <span className="text-slate-500">{point.dist}</span>
          <span
            className={`font-black text-sm tabular-nums ml-1 ${isPodium ? "" : "text-slate-100"}`}
            style={isPodium ? { color: PODIUM_COLORS[point.pos] } : undefined}
          >
            #{point.pos}
          </span>
          <span className="text-slate-600">/ {point.finisherCount}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade delay-200 bg-[#0c1628] rounded-2xl border border-white/[0.07] p-4 sm:p-5 mb-8">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <h2 className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
            Performance Trend
          </h2>
          <div className="flex gap-3 flex-wrap">
            {uniqueDists.map((d) => (
              <span key={d} className="flex items-center gap-1 text-[10px] text-slate-600 font-semibold">
                <span
                  className="w-2 h-2 rounded-full inline-block shrink-0"
                  style={{ background: distDotColor(d), boxShadow: `0 0 4px ${distDotColor(d)}60` }}
                />
                {d}
              </span>
            ))}
          </div>
        </div>
        <select
          value={selectedYear === "all" ? "all" : String(selectedYear)}
          onChange={(e) =>
            setSelectedYear(
              e.target.value === "all" ? "all" : Number(e.target.value),
            )
          }
          className="px-2.5 py-1 text-xs font-semibold rounded-lg input-dark focus:outline-none shrink-0"
        >
          <option value="all">All seasons</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <ResponsiveContainer width="100%" height={230}>
        <LineChart
          data={flat}
          margin={{ top: 24, right: 12, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.6" />
              <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.6" />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="0"
            stroke="rgba(255,255,255,0.03)"
            horizontal={true}
            vertical={false}
          />
          {/* Top 3 zone highlight */}
          <ReferenceLine y={3} stroke="rgba(251,191,36,0.12)" strokeDasharray="4 4" strokeWidth={1} />
          <XAxis
            dataKey="dateMs"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={tickDate}
            tick={{ fontSize: 10, fill: "#334155", fontFamily: "Barlow, sans-serif", fontWeight: 600 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            reversed
            domain={[maxPos + 2, 1]}
            tick={{ fontSize: 10, fill: "#334155", fontFamily: "Barlow, sans-serif", fontWeight: 600 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tickFormatter={(v) => `#${v}`}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(255,255,255,0.06)", strokeWidth: 1 }} />
          <Line
            type="monotone"
            dataKey="pos"
            stroke="url(#lineGrad)"
            strokeWidth={2}
            dot={(props) => {
              const { cx, cy } = props;
              const point = props.payload as FlatPoint | undefined;
              const pos = point?.pos;
              if (!pos || cx == null || cy == null) {
                return <g key={String(props.key ?? "")} />;
              }

              const dotColor = distDotColor(point!.dist);
              const isPodium = pos <= 3;
              const podiumColor = isPodium ? PODIUM_COLORS[pos]! : null;
              const label = `#${pos}`;
              const labelColor = isPodium ? podiumColor! : dotColor;

              return (
                <g key={String(props.key ?? "")}>
                  {/* Outer glow ring for podium */}
                  {isPodium && (
                    <circle cx={cx} cy={cy} r={8} fill={podiumColor!} fillOpacity="0.15" />
                  )}
                  <circle cx={cx} cy={cy} r={isPodium ? 5 : 3.5} fill={dotColor} />
                  {isPodium && (
                    <circle cx={cx} cy={cy} r={isPodium ? 5 : 3.5} fill="none" stroke={podiumColor!} strokeWidth="1.5" strokeOpacity="0.8" />
                  )}
                  <text
                    x={cx}
                    y={cy - (isPodium ? 13 : 11)}
                    textAnchor="middle"
                    fontSize={isPodium ? 11 : 9}
                    fontWeight={isPodium ? 800 : 600}
                    fontFamily="Barlow Condensed, sans-serif"
                    fill={labelColor}
                    fillOpacity={isPodium ? 1 : 0.7}
                  >
                    {label}
                  </text>
                </g>
              );
            }}
            activeDot={(props) => {
              const point = props.payload as FlatPoint | undefined;
              const dotColor = distDotColor(point?.dist ?? "");
              return (
                <g key={String(props.key ?? "")}>
                  <circle cx={props.cx} cy={props.cy} r={10} fill={dotColor} fillOpacity="0.15" />
                  <circle cx={props.cx} cy={props.cy} r={5} fill={dotColor} />
                </g>
              );
            }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
