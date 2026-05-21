import type { AthleteResultRef } from "@granfondo/database/types";
import { distBadgeClass } from "../utils/distance";
import { DISTANCES } from "@granfondo/utils/distance";

function buildStats(results: AthleteResultRef[]) {
  const finished = results.filter((r) => !r.dnf && !r.dns && r.pos > 0);

  const bestByDist = new Map<string, number>();
  for (const r of finished) {
    const d = r.distance;
    const prev = bestByDist.get(d);
    if (prev === undefined || r.pos < prev) {
      bestByDist.set(d, r.pos);
    }
  }

  const podiums = finished.filter((r) => r.pos <= 3).length;

  return { bestByDist, podiums };
}

interface Props {
  results: AthleteResultRef[];
}

export default function CareerHighlights({ results }: Props) {
  const { bestByDist, podiums } = buildStats(results);

  const distEntries = DISTANCES.filter((d) => bestByDist.has(d)).map((d) => ({
    dist: d,
    best: bestByDist.get(d)!,
  }));

  if (distEntries.length === 0 && podiums === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-8">
      <h2 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wide">
        Career Highlights
      </h2>
      <div className="flex flex-wrap gap-4">
        {distEntries.map(({ dist, best }) => (
          <div
            key={dist}
            className="flex flex-col items-center gap-1 min-w-[72px]"
          >
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${distBadgeClass(dist)}`}
            >
              {dist}
            </span>
            <span
              className={`text-base font-extrabold ${best <= 3 ? "text-amber-500" : "text-slate-700"}`}
            >
              {best === 1
                ? "🥇"
                : best === 2
                  ? "🥈"
                  : best === 3
                    ? "🥉"
                    : `#${best}`}
            </span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wide">
              Best
            </span>
          </div>
        ))}
        {podiums > 0 && (
          <div className="flex flex-col items-center gap-1 min-w-[72px]">
            <span className="text-xl">🏆</span>
            <span className="text-base font-extrabold text-amber-500">
              {podiums}
            </span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wide">
              Podiums
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
