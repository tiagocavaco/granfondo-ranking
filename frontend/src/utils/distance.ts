// Alias → canonical display name
const DISTANCE_CANON: Record<string, string> = {
  "BIG DAY":    "Granfondo",
  "Clássica":   "Granfondo",
  GranFondo:    "Granfondo",
  "HALF DAY":   "Mediofondo",
  Etapa:        "Mediofondo",
  "TIME TRIAL": "Time Trial",
};

// Canonical display name → hex color (used in charts / dot markers)
const DISTANCE_DOT_COLOR: Record<string, string> = {
  Granfondo:    "#3b82f6",
  Mediofondo:   "#8b5cf6",
  Minifondo:    "#10b981",
  "Time Trial": "#f59e0b",
};

// Canonical display name → Tailwind badge classes (used in result tables)
const DISTANCE_BADGE_CLASS: Record<string, string> = {
  Granfondo:    "bg-blue-50 text-blue-700",
  Mediofondo:   "bg-violet-50 text-violet-700",
  Minifondo:    "bg-emerald-50 text-emerald-700",
  "Time Trial": "bg-amber-50 text-amber-700",
};

export function canonDist(name: string): string {
  return DISTANCE_CANON[name] ?? name;
}

export function distDotColor(name: string): string {
  return DISTANCE_DOT_COLOR[canonDist(name)] ?? "#64748b";
}

export function distBadgeClass(name: string): string {
  return DISTANCE_BADGE_CLASS[canonDist(name)] ?? "bg-slate-100 text-slate-600";
}
