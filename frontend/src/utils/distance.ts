const DISTANCE_BADGE_CLASS: Record<string, string> = {
  Granfondo: "bg-blue-500/15 text-blue-300 border border-blue-500/25",
  Mediofondo: "bg-violet-500/15 text-violet-300 border border-violet-500/25",
  Minifondo: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25",
  "Time Trial": "bg-amber-500/15 text-amber-300 border border-amber-500/25",
};

const DISTANCE_DOT_COLOR: Record<string, string> = {
  Granfondo: "#3b82f6",
  Mediofondo: "#8b5cf6",
  Minifondo: "#10b981",
  "Time Trial": "#f59e0b",
};

export function distBadgeClass(name: string): string {
  return DISTANCE_BADGE_CLASS[name] ?? "bg-slate-100 text-slate-600";
}

const DISTANCE_BADGE_CLASS_BORDERED: Record<string, string> = {
  Granfondo: "bg-blue-500/15 text-blue-300 border border-blue-500/30",
  Mediofondo: "bg-violet-500/15 text-violet-300 border border-violet-500/30",
  Minifondo: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  "Time Trial": "bg-amber-500/15 text-amber-300 border border-amber-500/30",
};

export function distBadgeClassBordered(name: string): string {
  return (
    DISTANCE_BADGE_CLASS_BORDERED[name] ??
    "bg-slate-100 text-slate-600 border border-slate-200"
  );
}

export function distDotColor(name: string): string {
  return DISTANCE_DOT_COLOR[name] ?? "#64748b";
}
