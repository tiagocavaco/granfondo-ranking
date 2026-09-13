import { useNavigate } from "react-router-dom";
import {
  ATHLETE_POINTS_TABLE,
  ATHLETE_COEFFICIENT_REFERENCE,
  finisherCoefficient,
} from "@granfondo/utils/scoring";

function ordinal(n: number) {
  if (n === 1) return "st";
  if (n === 2) return "nd";
  if (n === 3) return "rd";
  return "th";
}

const POINTS = (() => {
  let prev = 0;
  return ATHLETE_POINTS_TABLE.map(({ maxPos, points }) => {
    const label =
      maxPos === prev + 1
        ? `${maxPos}${ordinal(maxPos)}`
        : `${prev + 1}–${maxPos}`;
    prev = maxPos;
    return { pos: label, pts: points };
  });
})();

const COEFF_SAMPLES = [75, 150, ATHLETE_COEFFICIENT_REFERENCE, 600, 900].map(
  (f) => ({ finishers: f, coeff: finisherCoefficient(f).toFixed(2) }),
);

export default function AthleteRankingInfoPage() {
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
        Athlete Ranking — How it works
      </h1>
      <p className="text-slate-500 text-sm mb-8">
        Points are awarded per race based on finishing position within your
        gender, then scaled by a difficulty coefficient based on the number of
        finishers per distance.
      </p>

      <div className="bg-[#0c1628] border border-white/[0.07] rounded-2xl px-6 py-5 mb-8 font-mono text-sm">
        <div className="text-slate-600 text-[10px] uppercase tracking-widest mb-2 font-bold">
          Formula
        </div>
        <div className="text-blue-300">points = base_points × coefficient</div>
        <div className="text-slate-500 mt-1 text-xs">
          coefficient = √(finishers / 300) · rounded to 2 decimal places
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div>
          <h2 className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-3">
            Base points by position
          </h2>
          <div className="rounded-2xl border border-white/[0.07] overflow-hidden bg-[#0c1628]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#060d1a] text-[10px] text-slate-600 uppercase tracking-widest border-b border-white/[0.05]">
                  <th className="px-4 py-2.5 text-left font-bold">Gender position</th>
                  <th className="px-4 py-2.5 text-right font-bold">Base pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {POINTS.map((row) => (
                  <tr key={row.pos} className="hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-2 text-slate-300 font-medium">
                      {row.pos}
                    </td>
                    <td className="px-4 py-2 text-right font-black text-blue-400 tabular-nums">
                      {row.pts}
                    </td>
                  </tr>
                ))}
                <tr className="bg-white/[0.02]">
                  <td className="px-4 py-2 text-slate-600 text-xs">51st+</td>
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
                  <th className="px-4 py-2.5 text-left font-bold">Finishers</th>
                  <th className="px-4 py-2.5 text-right font-bold">Coefficient</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {COEFF_SAMPLES.map((row) => {
                  const isRef = row.finishers === ATHLETE_COEFFICIENT_REFERENCE;
                  return (
                    <tr
                      key={row.finishers}
                      className={isRef ? "bg-blue-500/10" : "hover:bg-white/[0.03] transition-colors"}
                    >
                      <td className={`px-4 py-2 font-medium ${isRef ? "text-blue-300" : "text-slate-300"}`}>
                        {row.finishers}
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
            * 300 finishers per distance = 1.00. Races with more finishers
            reward more points.
          </p>
        </div>

        <div>
          <h2 className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-3">Rules</h2>
          <div className="rounded-2xl border border-white/[0.07] bg-[#0c1628] px-6 py-5 text-sm text-slate-400">
            <ol className="space-y-3">
              <li className="flex gap-3 items-start">
                <span className="shrink-0 text-[10px] font-black text-slate-700 tabular-nums mt-0.5 w-4">01</span>
                <span>Points are awarded per gender.</span>
              </li>
              <li className="flex gap-3 items-start">
                <span className="shrink-0 text-[10px] font-black text-slate-700 tabular-nums mt-0.5 w-4">02</span>
                <span>Only the top 50 finishers score points.</span>
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
