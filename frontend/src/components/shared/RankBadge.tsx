export function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-yellow-400 to-amber-500 text-white font-black text-base shadow-md">
        🥇
      </span>
    );
  }

  if (rank === 2) {
    return (
      <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-slate-300 to-slate-400 text-white font-black text-base shadow-sm">
        🥈
      </span>
    );
  }

  if (rank === 3) {
    return (
      <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-orange-400 to-orange-500 text-white font-black text-base shadow-sm">
        🥉
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center w-9 h-9 rounded-xl text-xs font-bold ${
        rank <= 10 ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      {rank}
    </span>
  );
}
