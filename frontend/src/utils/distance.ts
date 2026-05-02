const DISTANCE_BADGE_CLASS: Record<string, string> = {
  Granfondo:    "bg-blue-50 text-blue-700",
  Mediofondo:   "bg-violet-50 text-violet-700",
  Minifondo:    "bg-emerald-50 text-emerald-700",
  "Time Trial": "bg-amber-50 text-amber-700",
};

const DISTANCE_DOT_COLOR: Record<string, string> = {
  Granfondo:    "#3b82f6",
  Mediofondo:   "#8b5cf6",
  Minifondo:    "#10b981",
  "Time Trial": "#f59e0b",
};

export function distBadgeClass(name: string): string {
  return DISTANCE_BADGE_CLASS[name] ?? "bg-slate-100 text-slate-600";
}

const DISTANCE_BADGE_CLASS_BORDERED: Record<string, string> = {
  Granfondo:    "bg-blue-50 text-blue-700 border border-blue-200",
  Mediofondo:   "bg-violet-50 text-violet-700 border border-violet-200",
  Minifondo:    "bg-emerald-50 text-emerald-700 border border-emerald-200",
  "Time Trial": "bg-amber-50 text-amber-700 border border-amber-200",
};

export function distBadgeClassBordered(name: string): string {
  return DISTANCE_BADGE_CLASS_BORDERED[name] ?? "bg-slate-100 text-slate-600 border border-slate-200";
}

export function distDotColor(name: string): string {
  return DISTANCE_DOT_COLOR[name] ?? "#64748b";
}
