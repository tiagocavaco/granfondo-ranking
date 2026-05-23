export function pointsBarColor(pts: number, max: number): string {
  const pct = pts / max;
  if (pct > 0.6) return "from-blue-500 to-indigo-600";
  if (pct > 0.3) return "from-violet-400 to-blue-500";
  return "from-slate-300 to-slate-400";
}
