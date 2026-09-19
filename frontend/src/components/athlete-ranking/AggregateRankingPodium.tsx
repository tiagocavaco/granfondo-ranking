import { Link } from "react-router-dom";
import type { AggregateAthlete } from "@granfondo/database/types";
import { countryFlag } from "@granfondo/database/normalize";
import { TeamLink } from "../shared/TeamLink";
import { MedalBadge } from "../shared/MedalBadge";

type RankedAthlete = AggregateAthlete & { rank: number };

function PodiumCard({
  athlete,
  animDelay,
  isMobileFirst = false,
}: {
  athlete: RankedAthlete;
  animDelay: number;
  isMobileFirst?: boolean;
}) {
  const isFirst = athlete.rank === 1;
  const isSecond = athlete.rank === 2;

  const cardBase =
    "rounded-2xl relative overflow-hidden border transition-all duration-300 cursor-pointer";
  const cardStyle = isFirst
    ? `${cardBase} bg-gradient-to-b from-amber-500/10 to-[#0c1628] border-amber-500/25 glow-gold hover:border-amber-400/40`
    : isSecond
      ? `${cardBase} bg-gradient-to-b from-slate-400/10 to-[#0c1628] border-slate-400/20 glow-silver hover:border-slate-400/35`
      : `${cardBase} bg-gradient-to-b from-orange-500/15 to-[#0c1628] border-orange-500/30 glow-bronze hover:border-orange-400/45`;

  const ptsColor = isFirst
    ? "text-amber-400"
    : isSecond
      ? "text-slate-300"
      : "text-orange-400";
  const subColor = isFirst
    ? "text-amber-500"
    : isSecond
      ? "text-slate-600"
      : "text-orange-600";

  const padding = isMobileFirst
    ? "px-4 pt-5 pb-4 sm:px-3 sm:pt-5 sm:pb-4"
    : "px-3.5 pt-5 pb-4 sm:px-3 sm:pt-5 sm:pb-4";

  return (
    <div
      style={{ animationDelay: `${animDelay}ms` }}
      className={`animate-in ${cardStyle}`}
    >
      {isFirst && (
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-amber-400/0 via-amber-300 to-amber-400/0" />
      )}
      <Link
        to={`/athlete/${athlete.id}`}
        className="absolute inset-0 z-10"
        aria-label={athlete.name}
      />
      <div className={`text-center ${padding}`}>
        <div className="mb-2 flex justify-center">
          <MedalBadge
            rank={athlete.rank as 1 | 2 | 3}
            size={isMobileFirst ? "lg" : "sm"}
          />
        </div>
        <div
          className={`leading-tight mb-1 line-clamp-2 ${isMobileFirst ? "font-black text-amber-100 text-sm sm:text-base" : "font-bold text-slate-200 text-xs"}`}
        >
          <span className="mr-0.5" title={athlete.country}>
            {countryFlag(athlete.country)}
          </span>
          {athlete.name}
        </div>
        <TeamLink
          team={athlete.team ?? ""}
          className={`text-[10px] transition-colors truncate block mb-1.5 ${isMobileFirst ? "text-amber-500 hover:text-amber-300" : "text-slate-600 hover:text-blue-400"}`}
        />
        <div
          className={`font-black tabular-nums ${isMobileFirst ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl"} ${ptsColor}`}
        >
          {athlete.totalPoints}
        </div>
        <div className={`text-[10px] font-medium ${subColor}`}>pts</div>
        <div className={`text-[10px] mt-0.5 ${subColor}`}>
          {athlete.eventsScored} races
        </div>
      </div>
    </div>
  );
}

export function AggregateRankingPodium({
  topThree,
}: {
  topThree: RankedAthlete[];
}) {
  const first = topThree[0]!;
  const second = topThree[1]!;
  const third = topThree[2]!;

  return (
    <div className="mb-8">
      {/* Mobile: 1st full-width on top, 2nd+3rd side by side below */}
      <div className="sm:hidden space-y-2">
        <PodiumCard athlete={first} animDelay={0} isMobileFirst />
        <div className="grid grid-cols-2 gap-2">
          <PodiumCard athlete={second} animDelay={150} />
          <PodiumCard athlete={third} animDelay={300} />
        </div>
      </div>
      {/* Desktop: [2nd] [1st] [3rd] */}
      <div className="hidden sm:grid sm:grid-cols-3 sm:gap-3 sm:items-end">
        <div className="mt-4">
          <PodiumCard athlete={second} animDelay={150} />
        </div>
        <PodiumCard athlete={first} animDelay={0} isMobileFirst />
        <div className="mt-4">
          <PodiumCard athlete={third} animDelay={300} />
        </div>
      </div>
    </div>
  );
}
