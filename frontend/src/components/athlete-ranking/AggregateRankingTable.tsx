import React, { useState } from "react";
import { Link } from "react-router-dom";
import type {
  AggregateAthlete,
  AggregateResult,
} from "@granfondo/database/types";
import { countryFlag } from "@granfondo/database/normalize";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
import { RankBadge } from "../shared/RankBadge";
import { ScrollSentinel } from "../shared/ScrollSentinel";
import { PointsBadge } from "../shared/PointsBadge";
import { TeamLink } from "../shared/TeamLink";
import { pointsBarColor } from "../../utils/pointsBarColor";
import { rankTextColor, rankBorderAccent } from "../../utils/posStyle";

type RankedAthlete = AggregateAthlete & { rank: number };

function RaceBreakdown({ results }: { results: AggregateResult[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
      {results.map((r) => (
        <div
          key={r.eventId}
          className="bg-white/[0.03] rounded-lg px-3 py-2 border border-white/[0.07] flex items-center justify-between gap-2"
        >
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-300 truncate">
              {r.eventName}
            </div>
            <div className="text-[11px] text-slate-600">{r.eventDate}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-xs">
            <span className="text-slate-500">
              P<strong className="text-slate-300">{r.pos}</strong>
            </span>
            <span className="text-slate-600">
              {r.basePoints} × {r.coefficient}
            </span>
            <span className="text-slate-600 hidden sm:inline">
              ({r.distanceFinishers} fin.)
            </span>
            <PointsBadge points={r.points} />
          </div>
        </div>
      ))}
    </div>
  );
}

interface Props {
  ranked: RankedAthlete[];
  maxPoints: number;
  resetKey: string;
}

export function AggregateRankingTable({ ranked, maxPoints, resetKey }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { visibleCount, sentinelRef } = useInfiniteScroll(
    ranked.length,
    resetKey,
  );

  return (
    <div
      className="rounded-2xl border border-white/[0.07] overflow-hidden overflow-x-auto bg-[#0c1628]"
      id="ranking-table"
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#060d1a] text-xs text-slate-500 uppercase tracking-wider border-b border-white/[0.06]">
            <th className="px-2 sm:px-4 py-3 text-left w-10 sm:w-14">Rank</th>
            <th className="px-2 sm:px-4 py-3 text-left">Athlete</th>
            <th className="px-4 py-3 text-left hidden lg:table-cell">Team</th>
            <th className="px-4 py-3 text-center hidden sm:table-cell w-20">
              Races
            </th>
            <th className="px-4 py-3 text-center hidden md:table-cell w-20">
              Best
            </th>
            <th className="px-2 sm:px-4 py-3 text-right w-20 sm:w-32">
              Points
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {ranked.slice(0, visibleCount).map((a) => (
            <React.Fragment key={a.id}>
              <tr
                onClick={() =>
                  setExpanded(expanded === String(a.id) ? null : String(a.id))
                }
                className={`cursor-pointer transition-colors hover:bg-white/[0.03] ${
                  expanded === String(a.id) ? "bg-blue-500/[0.06]" : ""
                } ${a.rank <= 3 ? "bg-white/[0.02]" : ""}`}
              >
                <td className={`py-3 pl-2 pr-2 sm:pr-4 ${rankBorderAccent(a.rank)}`}>
                  <RankBadge rank={a.rank} />
                </td>
                <td className="px-2 sm:px-4 py-3 w-full max-w-0 overflow-hidden">
                  <Link
                    to={`/athlete/${a.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className={`hover:text-blue-300 transition-colors ${a.rank <= 10 ? "font-bold text-white" : "font-semibold text-slate-100"}`}
                  >
                    <span className="mr-1.5" title={a.country}>
                      {countryFlag(a.country)}
                    </span>
                    {a.name}
                  </Link>
                  <div className="text-xs text-slate-600 lg:hidden mt-0.5 truncate">
                    <TeamLink
                      team={a.team ?? ""}
                      onClick={(e) => e.stopPropagation()}
                      className="hover:text-blue-400 transition-colors"
                    />
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600 text-xs hidden lg:table-cell whitespace-nowrap">
                  <TeamLink
                    team={a.team ?? ""}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-blue-400 transition-colors"
                  />
                </td>
                <td className="px-4 py-3 text-center text-slate-500 font-medium hidden sm:table-cell">
                  {a.eventsScored}
                </td>
                <td className="px-4 py-3 text-center text-slate-500 hidden md:table-cell">
                  <span className={`font-semibold tabular-nums ${rankTextColor(a.bestPos, "text-slate-400")}`}>
                    #{a.bestPos}
                  </span>
                </td>
                <td className="px-2 sm:px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="hidden sm:block w-20 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${pointsBarColor(a.totalPoints, maxPoints)}`}
                        style={{
                          width: `${(a.totalPoints / maxPoints) * 100}%`,
                        }}
                      />
                    </div>
                    <span className={`font-extrabold tabular-nums inline-block w-14 text-right ${rankTextColor(a.rank, "text-blue-400")}`}>
                      {a.totalPoints.toFixed(1)}
                    </span>
                  </div>
                </td>
              </tr>

              {expanded === String(a.id) && (
                <tr key={`${a.id}-detail`}>
                  <td colSpan={6} className="px-4 pb-4 pt-1 bg-blue-500/[0.04]">
                    <div className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
                      Race breakdown
                    </div>
                    <RaceBreakdown results={a.results} />
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      <ScrollSentinel sentinelRef={sentinelRef} visible={visibleCount} total={ranked.length} />
    </div>
  );
}
