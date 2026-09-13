import { useNavigate } from "react-router-dom";
import {
  TEAM_POINTS_TABLE,
  TEAM_COEFFICIENT_REFERENCE,
  teamCoefficient,
} from "@granfondo/utils/scoring";

function ordinal(n: number) {
  if (n === 1) return "st";
  if (n === 2) return "nd";
  if (n === 3) return "rd";
  return "th";
}

const POINTS = TEAM_POINTS_TABLE.map(({ maxRank, points }) => ({
  rank: `${maxRank}${ordinal(maxRank)}`,
  pts: points,
}));

const COEFF_SAMPLES = [5, 10, TEAM_COEFFICIENT_REFERENCE, 50, 100].map((t) => ({
  teams: t,
  coeff: teamCoefficient(t).toFixed(2),
}));

export default function TeamRankingInfoPage() {
  const navigate = useNavigate();

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-slate-500 hover:text-slate-300 transition-colors mb-4 inline-flex items-center gap-1"
      >
        ← Back
      </button>

      <h1 className="font-display font-bold text-4xl sm:text-5xl text-white tracking-wide uppercase mb-2">
        Team Ranking — How it works
      </h1>
      <p className="text-slate-500 text-sm mb-8">
        Points are awarded per event based on the sum of finishing positions of
        a team's top 3 athletes, then scaled by a difficulty coefficient based
        on how many teams competed.
      </p>

      <div className="bg-[#0c1628] border border-white/[0.07] rounded-2xl px-6 py-5 mb-8 font-mono text-sm">
        <div className="text-slate-600 text-[10px] uppercase tracking-widest mb-2 font-bold">
          Formula
        </div>
        <div className="text-blue-300">points = base_points × coefficient</div>
        <div className="text-slate-500 mt-1 text-xs">
          coefficient = √(eligible_teams / 25) · rounded to 2 decimal places
        </div>
        <div className="text-slate-500 text-xs">
          team rank = lowest sum of top 3 finishing positions wins
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div>
          <h2 className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-3">
            Base points by team rank
          </h2>
          <div className="rounded-2xl border border-white/[0.07] overflow-hidden bg-[#0c1628]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#060d1a] text-[10px] text-slate-600 uppercase tracking-widest border-b border-white/[0.05]">
                  <th className="px-4 py-2.5 text-left font-bold">Team rank</th>
                  <th className="px-4 py-2.5 text-right font-bold">Base pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {POINTS.map((row) => (
                  <tr key={row.rank} className="hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-2 text-slate-300 font-medium">
                      {row.rank}
                    </td>
                    <td className="px-4 py-2 text-right font-black text-blue-400 tabular-nums">
                      {row.pts}
                    </td>
                  </tr>
                ))}
                <tr className="bg-white/[0.02]">
                  <td className="px-4 py-2 text-slate-600 text-xs">11th+</td>
                  <td className="px-4 py-2 text-right text-slate-600 text-xs">0</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-3">
            Difficulty coefficient
          </h2>
          <div className="rounded-2xl border border-white/[0.07] overflow-hidden bg-[#0c1628]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#060d1a] text-[10px] text-slate-600 uppercase tracking-widest border-b border-white/[0.05]">
                  <th className="px-4 py-2.5 text-left font-bold">Teams</th>
                  <th className="px-4 py-2.5 text-right font-bold">Coefficient</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {COEFF_SAMPLES.map((row) => {
                  const isRef = row.teams === TEAM_COEFFICIENT_REFERENCE;
                  return (
                    <tr
                      key={row.teams}
                      className={isRef ? "bg-blue-500/10" : "hover:bg-white/[0.03] transition-colors"}
                    >
                      <td className={`px-4 py-2 font-medium ${isRef ? "text-blue-300" : "text-slate-300"}`}>
                        {row.teams}
                        {isRef && (
                          <span className="ml-2 text-xs font-normal text-blue-500">
                            reference*
                          </span>
                        )}
                      </td>
                      <td className={`px-4 py-2 text-right font-black tabular-nums ${isRef ? "text-blue-300" : "text-slate-300"}`}>
                        {row.coeff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-600 mt-3">
            * 25 eligible teams = 1.00. Races with more teams reward more
            points.
          </p>
        </div>

        <div>
          <h2 className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-3">Rules</h2>
          <div className="rounded-2xl border border-white/[0.07] bg-[#0c1628] px-6 py-5 text-sm text-slate-400">
            <ol className="space-y-3">
              <li className="flex gap-3 items-start">
                <span className="shrink-0 text-[10px] font-black text-slate-700 tabular-nums mt-0.5 w-4">01</span>
                <span>
                  A team must have at least 3 finishers per distance to score —
                  these are the eligible teams used in the coefficient.
                </span>
              </li>
              <li className="flex gap-3 items-start">
                <span className="shrink-0 text-[10px] font-black text-slate-700 tabular-nums mt-0.5 w-4">02</span>
                <span>
                  The top 3 finishers' positions are summed — lowest combined
                  score wins (overall position, not gender).
                </span>
              </li>
              <li className="flex gap-3 items-start">
                <span className="shrink-0 text-[10px] font-black text-slate-700 tabular-nums mt-0.5 w-4">03</span>
                <span>Rankings are per distance.</span>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
