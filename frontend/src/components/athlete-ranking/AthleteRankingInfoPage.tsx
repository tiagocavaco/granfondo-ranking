import { BackButton } from "../shared/BackButton";
import { FormulaBox } from "../shared/FormulaBox";
import { RulesList } from "../shared/RulesList";
import { SectionLabel } from "../shared/SectionLabel";
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
  return (
    <div>
      <BackButton />

      <div className="text-[10px] font-black tracking-[0.3em] text-blue-500/70 uppercase mb-2">
        Athlete Ranking
      </div>
      <h1 className="font-display font-bold text-4xl sm:text-5xl text-white tracking-wide uppercase mb-2">
        How it works
      </h1>
      <p className="text-slate-500 text-sm mb-8">
        Points are awarded per race based on finishing position within your
        gender, then scaled by a difficulty coefficient based on the number of
        finishers per distance.
      </p>

      <FormulaBox>
        <div className="text-blue-300">points = base_points × coefficient</div>
        <div className="text-slate-500 mt-1 text-xs">
          coefficient = √(finishers / 300) · rounded to 2 decimal places
        </div>
      </FormulaBox>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div>
          <SectionLabel className="mb-3">Base points by position</SectionLabel>
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
          <SectionLabel className="mb-3">Difficulty coefficient</SectionLabel>
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
          <SectionLabel className="mb-3">Rules</SectionLabel>
          <RulesList items={[
            "Points are awarded per gender.",
            "Only the top 50 finishers score points.",
            "Rankings are per distance.",
          ]} />
        </div>
      </div>
    </div>
  );
}
