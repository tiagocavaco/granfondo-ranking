import React, { useState } from "react";
import { Link } from "react-router-dom";
import type {
  AggregateAthlete,
  AggregateResult,
} from "@granfondo/database/types";
import { countryFlag } from "@granfondo/database/normalize";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
import { RankBadge } from "../shared/RankBadge";
import { TeamLink } from "../shared/TeamLink";
import { pointsBarColor } from "../../utils/pointsBarColor";

type RankedAthlete = AggregateAthlete & { rank: number };

function RaceBreakdown({ results }: { results: AggregateResult[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
      {results.map((r) => (
        <div
          key={r.eventId}
          className="bg-white rounded-lg px-3 py-2 border border-blue-100 flex items-center justify-between gap-2"
        >
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-700 truncate">
              {r.eventName}
            </div>
            <div className="text-[11px] text-slate-400">{r.eventDate}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-xs">
            <span className="text-slate-500">
              P<strong className="text-slate-800">{r.pos}</strong>
            </span>
            <span className="text-slate-400">
              {r.basePoints} × {r.coefficient}
            </span>
            <span className="text-slate-400 hidden sm:inline">
              ({r.distanceFinishers} fin.)
            </span>
            <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
              +{r.points}
            </span>
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
      className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto bg-white"
      id="ranking-table"
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-100">
            <th className="px-2 sm:px-4 py-3 text-left w-10 sm:w-14">Rank</th>
            <th className="px-2 sm:px-4 py-3 text-left">Athlete</th>
            <th className="px-4 py-3 text-left hidden lg:table-cell">Team</th>
            <th className="px-4 py-3 text-center hidden sm:table-cell w-20">
              Races
            </th>
            <th className="px-4 py-3 text-center hidden md:table-cell w-20">
              Best Pos
            </th>
            <th className="px-2 sm:px-4 py-3 text-right w-20 sm:w-32">
              Points
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {ranked.slice(0, visibleCount).map((a) => (
            <React.Fragment key={a.id}>
              <tr
                onClick={() =>
                  setExpanded(expanded === String(a.id) ? null : String(a.id))
                }
                className={`cursor-pointer transition-colors hover:bg-blue-50/40 ${
                  expanded === String(a.id) ? "bg-blue-50/60" : ""
                } ${a.rank <= 3 ? "bg-slate-50/40" : ""}`}
              >
                <td className="px-2 sm:px-4 py-3">
                  <RankBadge rank={a.rank} />
                </td>
                <td className="px-2 sm:px-4 py-3 w-full max-w-0 overflow-hidden">
                  <Link
                    to={`/athlete/${a.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-semibold text-slate-900 hover:text-blue-600 transition-colors"
                  >
                    <span className="mr-1.5" title={a.country}>
                      {countryFlag(a.country)}
                    </span>
                    {a.name}
                  </Link>
                  <div className="text-xs text-slate-400 lg:hidden mt-0.5 truncate">
                    <TeamLink
                      team={a.team ?? ""}
                      onClick={(e) => e.stopPropagation()}
                      className="hover:text-blue-600 transition-colors"
                    />
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs hidden lg:table-cell whitespace-nowrap">
                  <TeamLink
                    team={a.team ?? ""}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-blue-600 transition-colors"
                  />
                </td>
                <td className="px-4 py-3 text-center text-slate-600 font-medium hidden sm:table-cell">
                  {a.eventsScored}
                </td>
                <td className="px-4 py-3 text-center text-slate-600 hidden md:table-cell">
                  <span className="font-semibold text-slate-800">
                    #{a.bestPos}
                  </span>
                </td>
                <td className="px-2 sm:px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="hidden sm:block w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${pointsBarColor(a.totalPoints, maxPoints)}`}
                        style={{
                          width: `${(a.totalPoints / maxPoints) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="font-extrabold text-blue-700 tabular-nums inline-block w-14 text-right">
                      {a.totalPoints.toFixed(1)}
                    </span>
                  </div>
                </td>
              </tr>

              {expanded === String(a.id) && (
                <tr key={`${a.id}-detail`}>
                  <td colSpan={6} className="px-4 pb-4 pt-1 bg-blue-50/60">
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
      {visibleCount < ranked.length && (
        <div
          ref={sentinelRef}
          className="px-4 py-3 text-xs text-slate-400 border-t border-slate-100 text-center"
        >
          Showing {visibleCount} of {ranked.length}…
        </div>
      )}
    </div>
  );
}
