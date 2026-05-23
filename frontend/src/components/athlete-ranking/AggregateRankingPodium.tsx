import { Link } from "react-router-dom";
import type { AggregateAthlete } from "@granfondo/database/types";
import { countryFlag } from "@granfondo/database/normalize";
import { TeamLink } from "../shared/TeamLink";

type RankedAthlete = AggregateAthlete & { rank: number };

export function AggregateRankingPodium({
  topThree,
}: {
  topThree: RankedAthlete[];
}) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-8">
      {[topThree[1]!, topThree[0]!, topThree[2]!].map((a, podiumIdx) => {
        const isFirst = a.rank === 1;
        return (
          <div
            key={a.id}
            className={`rounded-2xl p-3 sm:p-5 text-center relative overflow-hidden border ${
              isFirst
                ? "bg-gradient-to-b from-amber-50 to-white border-amber-200 shadow-md hover:shadow-lg"
                : podiumIdx === 0
                  ? "bg-gradient-to-b from-slate-50 to-white border-slate-200 hover:border-slate-300"
                  : "bg-gradient-to-b from-orange-50 to-white border-orange-200 hover:border-orange-300"
            } ${isFirst ? "mt-0" : "mt-4"} transition-shadow`}
          >
            <Link
              to={`/athlete/${a.id}`}
              className="absolute inset-0"
              aria-label={a.name}
            />
            <div className="relative">
              <div className="text-2xl sm:text-4xl mb-1 sm:mb-2">
                {a.rank === 1 ? "🥇" : a.rank === 2 ? "🥈" : "🥉"}
              </div>
              <div className="font-extrabold text-slate-900 text-xs sm:text-sm leading-tight mb-1 line-clamp-2">
                <span className="mr-1" title={a.country}>
                  {countryFlag(a.country)}
                </span>
                {a.name}
              </div>
              <TeamLink
                team={a.team ?? ""}
                className="text-[10px] sm:text-xs text-slate-500 mb-2 sm:mb-3 truncate hidden sm:block hover:text-blue-600 transition-colors"
              />
              <div
                className={`text-lg sm:text-2xl font-black ${isFirst ? "text-amber-600" : "text-slate-700"}`}
              >
                {a.totalPoints}
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium">
                pts
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 hidden sm:block">
                {a.eventsScored} races · best #{a.bestPos}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
