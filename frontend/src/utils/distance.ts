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

export function distDotColor(name: string): string {
  return DISTANCE_DOT_COLOR[name] ?? "#64748b";
}
