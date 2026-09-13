import { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { AthleteResultRef } from "@granfondo/database/types";

const COLOR_A = "#3b82f6";
const COLOR_B = "#f43f5e";

type SharedPair = { a: AthleteResultRef; b: AthleteResultRef };

function tickDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
  });
}

interface TooltipItem {
  dataKey: string;
  value: number;
  payload: { eventName: string };
}

function ChartTooltip({
  active,
  payload,
  aName,
  bName,
}: {
  active?: boolean;
  payload?: TooltipItem[];
  aName: string;
  bName: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div className="bg-[#0c1628] border border-white/[0.12] rounded-xl shadow-2xl px-4 py-3 text-xs backdrop-blur-sm">
      <p className="font-bold text-slate-300 mb-2 text-[11px] uppercase tracking-wide">{row.eventName}</p>
      {payload.map((item, idx) => {
        const color = idx === 0 ? COLOR_A : COLOR_B;
        const name = idx === 0 ? aName : bName;
        return (
          <div key={item.dataKey} className="flex items-center gap-2 mb-0.5">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: color, boxShadow: `0 0 6px ${color}` }}
            />
            <span className="text-slate-500 truncate max-w-[100px]">{name}</span>
            <span className="font-black text-slate-100 ml-auto tabular-nums">#{item.value}</span>
          </div>
        );
      })}
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
    () =>
      [
        ...new Set(shared.map((pair) => new Date(pair.a.eventDate).getFullYear())),
      ].sort((yearA, yearB) => yearB - yearA),
    [shared],
  );

  const [selectedYear, setSelectedYear] = useState<number | "all">("all");

  useEffect(() => {
    if (sharedYears.length > 0 && window.innerWidth < 640) {
      setSelectedYear(sharedYears[0]!);
    }
  }, [sharedYears]);

  const filtered = useMemo(
    () =>
      selectedYear === "all"
        ? shared
        : shared.filter(
            (pair) => new Date(pair.a.eventDate).getFullYear() === selectedYear,
          ),
    [shared, selectedYear],
  );

  const chartData = useMemo(
    () =>
      filtered.map((pair) => ({
        dateMs: new Date(pair.a.eventDate + "T12:00:00").getTime(),
        dateLabel: tickDate(new Date(pair.a.eventDate + "T12:00:00").getTime()),
        eventName: pair.a.eventName,
        a: pair.a.pos || null,
        b: pair.b.pos || null,
      })),
    [filtered],
  );

  const maxPos = useMemo(
    () => Math.max(...filtered.flatMap((pair) => [pair.a.pos, pair.b.pos]), 10),
    [filtered],
  );

  if (chartData.length < 2) return null;

  return (
    <div className="bg-[#0c1628] rounded-2xl border border-white/[0.07] p-4 mb-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
            Overall Trend
          </h2>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: COLOR_A, boxShadow: `0 0 4px ${COLOR_A}60` }}
              />
              {aName}
            </span>
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: COLOR_B, boxShadow: `0 0 4px ${COLOR_B}60` }}
              />
              {bName}
            </span>
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
          {sharedYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart
          data={chartData}
          margin={{ top: 12, right: 8, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="h2h-grad-a" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={COLOR_A} stopOpacity="0.5" />
              <stop offset="50%" stopColor={COLOR_A} stopOpacity="0.9" />
              <stop offset="100%" stopColor={COLOR_A} stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id="h2h-grad-b" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={COLOR_B} stopOpacity="0.5" />
              <stop offset="50%" stopColor={COLOR_B} stopOpacity="0.9" />
              <stop offset="100%" stopColor={COLOR_B} stopOpacity="0.5" />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="0"
            stroke="rgba(255,255,255,0.03)"
            horizontal={true}
            vertical={false}
          />
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
            tickFormatter={(val) => `#${val}`}
          />
          <Tooltip
            content={<ChartTooltip aName={aName} bName={bName} />}
            cursor={{ stroke: "rgba(255,255,255,0.06)", strokeWidth: 1 }}
          />
          <Line
            type="monotone"
            dataKey="a"
            name="a"
            stroke="url(#h2h-grad-a)"
            strokeWidth={2}
            dot={(props) => {
              const { cx, cy } = props;
              if (cx == null || cy == null) return <g key={String(props.key ?? "")} />;
              return (
                <g key={String(props.key ?? "")}>
                  <circle cx={cx} cy={cy} r={6} fill={COLOR_A} fillOpacity="0.15" />
                  <circle cx={cx} cy={cy} r={3.5} fill={COLOR_A} />
                </g>
              );
            }}
            activeDot={(props) => (
              <g key={String(props.key ?? "")}>
                <circle cx={props.cx} cy={props.cy} r={10} fill={COLOR_A} fillOpacity="0.2" />
                <circle cx={props.cx} cy={props.cy} r={5} fill={COLOR_A} />
              </g>
            )}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="b"
            name="b"
            stroke="url(#h2h-grad-b)"
            strokeWidth={2}
            dot={(props) => {
              const { cx, cy } = props;
              if (cx == null || cy == null) return <g key={String(props.key ?? "")} />;
              return (
                <g key={String(props.key ?? "")}>
                  <circle cx={cx} cy={cy} r={6} fill={COLOR_B} fillOpacity="0.15" />
                  <circle cx={cx} cy={cy} r={3.5} fill={COLOR_B} />
                </g>
              );
            }}
            activeDot={(props) => (
              <g key={String(props.key ?? "")}>
                <circle cx={props.cx} cy={props.cy} r={10} fill={COLOR_B} fillOpacity="0.2" />
                <circle cx={props.cx} cy={props.cy} r={5} fill={COLOR_B} />
              </g>
            )}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
