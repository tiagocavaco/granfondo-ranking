export function posStyle(pos: number): string {
  if (pos === 1) return "bg-gradient-to-br from-yellow-400 to-amber-500 text-white shadow-sm";
  if (pos === 2) return "bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow-sm";
  if (pos === 3) return "bg-gradient-to-br from-orange-400 to-orange-500 text-white shadow-sm";
  if (pos <= 10) return "bg-blue-50 text-blue-700 font-semibold";
  return "bg-slate-100 text-slate-500";
}
