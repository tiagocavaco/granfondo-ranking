import { MedalBadge } from "./MedalBadge";

export function RankBadge({ rank }: { rank: number }) {
  if (rank === 1 || rank === 2 || rank === 3) {
    return (
      <span className="inline-flex items-center justify-center w-9 h-9">
        <MedalBadge rank={rank} size="sm" />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center w-9 h-9 rounded-xl text-xs font-bold ${
        rank <= 10
          ? "bg-blue-500/15 text-blue-300 border border-blue-500/20"
          : "bg-white/5 text-slate-500 border border-white/5"
      }`}
    >
      {rank}
    </span>
  );
}
