import { useId } from "react";

const CONFIGS = {
  1: { outer: "#92400e", inner: "#fbbf24", mid: "#f59e0b", num: "#78350f" },
  2: { outer: "#475569", inner: "#e2e8f0", mid: "#cbd5e1", num: "#334155" },
  3: { outer: "#7c2d12", inner: "#fb923c", mid: "#f97316", num: "#7c2d12" },
} as const;

export function MedalBadge({ rank, size = "lg" }: { rank: 1 | 2 | 3; size?: "sm" | "lg" }) {
  const uid = useId();
  const cfg = CONFIGS[rank];
  const dim = size === "lg" ? 56 : 40;
  const radius = dim / 2;
  const fontSize = size === "lg" ? 20 : 14;
  const gradId = `medal-${uid}-${rank}`;

  return (
    <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} className="mx-auto">
      <defs>
        <radialGradient id={gradId} cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor={cfg.inner} />
          <stop offset="100%" stopColor={cfg.outer} />
        </radialGradient>
      </defs>
      <circle cx={radius} cy={radius} r={radius - 1} fill={`url(#${gradId})`} />
      <circle cx={radius} cy={radius} r={radius - 3} fill="none" stroke={cfg.mid} strokeWidth="1" strokeOpacity="0.6" />
      <text
        x={radius}
        y={radius + fontSize * 0.38}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight="900"
        fontFamily="Barlow Condensed, sans-serif"
        fill={cfg.num}
        fillOpacity="0.85"
      >
        {rank}
      </text>
    </svg>
  );
}

function catPosStyle(pos: number): string {
  if (pos === 1) return "bg-amber-400/20 text-amber-300 border border-amber-400/30";
  if (pos === 2) return "bg-slate-400/20 text-slate-300 border border-slate-400/30";
  if (pos === 3) return "bg-orange-400/20 text-orange-300 border border-orange-400/30";
  if (pos === 4) return "bg-white/[0.05] text-slate-500 border border-white/[0.10]";
  return "text-slate-600";
}

export function CatPosBadge({ pos }: { pos: number }) {
  if (pos >= 5) {
    return (
      <span className="text-[9px] font-bold text-slate-600 leading-none shrink-0">
        #{pos}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-black leading-none shrink-0 ${catPosStyle(pos)}`}>
      {pos}
    </span>
  );
}

export function MedalIcon({ rank }: { rank: 1 | 2 | 3 }) {
  const uid = useId();
  const cfg = CONFIGS[rank];
  const gradId = `medalicon-${uid}-${rank}`;
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <defs>
        <radialGradient id={gradId} cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor={cfg.inner} />
          <stop offset="100%" stopColor={cfg.outer} />
        </radialGradient>
      </defs>
      <circle cx="9" cy="9" r="8" fill={`url(#${gradId})`} />
      <circle cx="9" cy="9" r="6" fill="none" stroke={cfg.mid} strokeWidth="0.8" strokeOpacity="0.5" />
      <text x="9" y="13" textAnchor="middle" fontSize="9" fontWeight="900" fontFamily="Barlow Condensed, sans-serif" fill={cfg.num} fillOpacity="0.85">
        {rank}
      </text>
    </svg>
  );
}
