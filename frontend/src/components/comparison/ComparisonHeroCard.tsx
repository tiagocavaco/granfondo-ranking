import { Link } from "react-router-dom";
import type { AthleteEntry } from "@granfondo/database/types";
import { countryFlag } from "@granfondo/database/normalize";

interface Props {
  data: AthleteEntry;
  color: string;
  wins: number;
}

export function ComparisonHeroCard({ data, color, wins }: Props) {
  const finished = data.results.filter((r) => !r.dnf && !r.dns);
  const bestPos =
    finished.length > 0 ? Math.min(...finished.map((r) => r.pos)) : null;

  return (
    <div
      className="rounded-2xl border-2 p-4"
      style={{ borderColor: color + "40", background: color + "08" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">
          {countryFlag(data.results[0]?.country ?? "")}
        </span>
        <Link
          to={`/athlete/${data.id}`}
          className="font-extrabold text-slate-900 hover:underline text-sm sm:text-base"
        >
          {data.name}
        </Link>
      </div>
      {data.canonicalTeam && (
        <p className="text-xs text-slate-400 mb-3 truncate">
          {data.canonicalTeam}
        </p>
      )}
      <div className="flex gap-3 text-center">
        <div>
          <div className="text-lg font-extrabold" style={{ color }}>
            {wins}
          </div>
          <div className="text-[10px] text-slate-400 uppercase">Wins</div>
        </div>
        {bestPos && (
          <div>
            <div className="text-lg font-extrabold text-slate-700">
              #{bestPos}
            </div>
            <div className="text-[10px] text-slate-400 uppercase">Best</div>
          </div>
        )}
        <div>
          <div className="text-lg font-extrabold text-slate-700">
            {finished.length}
          </div>
          <div className="text-[10px] text-slate-400 uppercase">Races</div>
        </div>
      </div>
    </div>
  );
}
