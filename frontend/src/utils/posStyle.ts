export function posStyle(pos: number): string {
  if (pos === 1) {
    return "bg-gradient-to-br from-yellow-400 to-amber-500 text-white shadow-sm";
  }

  if (pos === 2) {
    return "bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow-sm";
  }

  if (pos === 3) {
    return "bg-gradient-to-br from-orange-400 to-orange-500 text-white shadow-sm";
  }

  if (pos <= 10) {
    return "bg-blue-500/15 text-blue-300 font-semibold";
  }

  return "bg-white/[0.06] text-slate-400";
}

/** Gold / silver / bronze text color for a rank. Pass a fallback for ranks 4+. */
export function rankTextColor(
  rank: number,
  fallback = "text-slate-200",
): string {
  if (rank === 1) {
    return "text-amber-400";
  }

  if (rank === 2) {
    return "text-slate-300";
  }

  if (rank === 3) {
    return "text-orange-400";
  }

  return fallback;
}

/** Left border accent for a table row keyed by rank. */
export function rankBorderAccent(rank: number): string {
  if (rank === 1) {
    return "border-l-[3px] border-amber-400";
  }

  if (rank === 2) {
    return "border-l-[3px] border-slate-400";
  }

  if (rank === 3) {
    return "border-l-[3px] border-orange-400";
  }

  if (rank <= 10) {
    return "border-l-[3px] border-blue-500/30";
  }

  return "border-l-[3px] border-transparent";
}

/** Subtle row background tint for top-3 (used in predictions list). */
export function rankRowBg(rank: number): string {
  if (rank === 1) {
    return "bg-amber-400/[0.04]";
  }

  if (rank === 2) {
    return "bg-slate-400/[0.03]";
  }

  if (rank === 3) {
    return "bg-orange-500/[0.03]";
  }

  return "";
}

/** Glass-style rank circle badge for top-3 (used in predictions list). */
export function rankBadgeStyle(rank: number): string {
  if (rank === 1) {
    return "bg-amber-400/20 text-amber-300 border border-amber-400/40";
  }

  if (rank === 2) {
    return "bg-slate-400/15 text-slate-300 border border-slate-400/30";
  }

  if (rank === 3) {
    return "bg-orange-500/15 text-orange-300 border border-orange-500/30";
  }

  return "bg-white/[0.07] text-slate-500";
}
