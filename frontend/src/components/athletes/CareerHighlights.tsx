import type { AthleteResultRef } from "@granfondo/database/types";
import { distBadgeClass } from "../../utils/distance";
import { DISTANCES } from "@granfondo/utils/distance";
import { rankTextColor } from "../../utils/posStyle";

function buildBestByDist(results: AthleteResultRef[]) {
  const finished = results.filter((r) => !r.dnf && !r.dns && r.pos > 0);
  const bestByDist = new Map<string, number>();
  for (const r of finished) {
    const d = r.distance;
    const prev = bestByDist.get(d);
    if (prev === undefined || r.pos < prev) {
      bestByDist.set(d, r.pos);
    }
  }
  return bestByDist;
}

interface Props {
  results: AthleteResultRef[];
}

export default function CareerHighlights({ results }: Props) {
  const bestByDist = buildBestByDist(results);

  const distEntries = DISTANCES.filter((d) => bestByDist.has(d)).map((d) => ({
    dist: d,
    best: bestByDist.get(d)!,
  }));

  if (distEntries.length === 0) {
    return null;
  }

  return (
    <div className="animate-fade delay-100 bg-[#0c1628] rounded-2xl border border-white/[0.07] p-5 mb-8">
      <h2 className="text-[10px] font-bold text-slate-600 mb-4 uppercase tracking-widest">
        Career Highlights
      </h2>
      <div className="flex flex-wrap gap-6">
        {distEntries.map(({ dist, best }, idx) => (
          <div key={dist} className="flex items-center gap-4">
            {idx > 0 && <div className="w-[1px] h-8 bg-white/[0.06]" />}
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span
                  className={`text-2xl sm:text-3xl font-black tabular-nums leading-none ${rankTextColor(best)}`}
                >
                  #{best}
                </span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${distBadgeClass(dist)}`}>
                {dist}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
