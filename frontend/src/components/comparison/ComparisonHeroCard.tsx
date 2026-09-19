import { Link } from "react-router-dom";
import type { AthleteEntry } from "@granfondo/database/types";
import { countryFlag } from "@granfondo/database/normalize";

function bestPosColor(rank: number): string {
  if (rank === 1) return "text-amber-400";
  if (rank === 2) return "text-slate-400";
  if (rank === 3) return "text-orange-400";
  return "text-slate-500";
}

interface Props {
  data: AthleteEntry;
  color: string;
  wins: number;
}

export function ComparisonHeroCard({ data, color, wins }: Props) {
  const finished = data.results.filter((r) => !r.dnf && !r.dns);
  const genderFinished = finished.filter((r) => r.genderPos > 0);
  const bestGenderPos =
    genderFinished.length > 0
      ? Math.min(...genderFinished.map((r) => r.genderPos))
      : null;
  const overallPodiums = finished.filter(
    (r) => r.genderPos > 0 && r.genderPos <= 3,
  ).length;
  const catPodiums = finished.filter(
    (r) => r.catPos > 0 && r.catPos <= 3,
  ).length;

  return (
    <div
      className="rounded-2xl border-2 p-5"
      style={{ borderColor: color + "40", background: color + "08" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">
          {countryFlag(data.results[0]?.country ?? "")}
        </span>
        <Link
          to={`/athlete/${data.id}`}
          className="font-display font-bold text-white hover:text-blue-300 transition-colors text-base sm:text-lg uppercase tracking-wide leading-tight"
        >
          {data.name}
        </Link>
      </div>
      {data.canonicalTeam && (
        <p className="text-xs text-slate-500 mb-3 truncate">
          {data.canonicalTeam}
        </p>
      )}
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-center mt-2 pt-3 border-t border-white/[0.06]">
        <div>
          <div className="text-lg font-extrabold" style={{ color }}>
            {wins}
          </div>
          <div className="text-[10px] text-slate-600 uppercase tracking-wider">
            Wins
          </div>
        </div>
        <div>
          <div
            className={`text-lg font-extrabold ${overallPodiums > 0 ? "text-amber-400" : "text-slate-600"}`}
          >
            {overallPodiums}
          </div>
          <div className="text-[10px] text-slate-600 uppercase tracking-wider">
            Podiums
          </div>
        </div>
        <div>
          <div
            className={`text-lg font-extrabold ${catPodiums > 0 ? "text-amber-400" : "text-slate-600"}`}
          >
            {catPodiums}
          </div>
          <div className="text-[10px] text-slate-600 uppercase tracking-wider">
            Cat Podiums
          </div>
        </div>
        {bestGenderPos && (
          <div>
            <div
              className={`text-lg font-extrabold ${bestPosColor(bestGenderPos)}`}
            >
              #{bestGenderPos}
            </div>
            <div className="text-[10px] text-slate-600 uppercase tracking-wider">
              Best
            </div>
          </div>
        )}
        <div>
          <div className="text-lg font-extrabold text-white">
            {finished.length}
          </div>
          <div className="text-[10px] text-slate-600 uppercase tracking-wider">
            Races
          </div>
        </div>
      </div>
    </div>
  );
}
