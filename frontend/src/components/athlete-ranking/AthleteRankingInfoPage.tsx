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
        className="text-sm text-slate-400 hover:text-slate-600 transition-colors mb-4 inline-flex items-center gap-1"
      >
        ← Back
      </button>

      <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
        Athlete Ranking — How it works
      </h1>
      <p className="text-slate-500 text-sm mb-8">
        Points are awarded per race based on finishing position within your
        gender, then scaled by a difficulty coefficient based on the number of
        finishers per distance.
      </p>

      <div className="bg-slate-900 text-white rounded-2xl px-6 py-5 mb-8 font-mono text-sm">
        <div className="text-slate-400 text-xs uppercase tracking-widest mb-2">
          Formula
        </div>
        <div className="text-blue-300">points = base_points × coefficient</div>
        <div className="text-slate-400 mt-1 text-xs">
          coefficient = √(finishers / 300) · rounded to 2 decimal places
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div>
          <h2 className="text-base font-bold text-slate-800 mb-3">
            Base points by position
          </h2>
          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-4 py-2 text-left">Gender position</th>
                  <th className="px-4 py-2 text-right">Base pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {POINTS.map((row) => (
                  <tr key={row.pos} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2 text-slate-700 font-medium">
                      {row.pos}
                    </td>
                    <td className="px-4 py-2 text-right font-extrabold text-blue-700">
                      {row.pts}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50/40">
                  <td className="px-4 py-2 text-slate-400 text-xs">51st+</td>
                  <td className="px-4 py-2 text-right text-slate-400 text-xs">
                    0
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="text-base font-bold text-slate-800 mb-3">
            Difficulty coefficient
          </h2>
          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-4 py-2 text-left">Finishers</th>
                  <th className="px-4 py-2 text-right">Coefficient</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {COEFF_SAMPLES.map((row) => {
                  const isRef = row.finishers === ATHLETE_COEFFICIENT_REFERENCE;
                  return (
                    <tr
                      key={row.finishers}
                      className={isRef ? "bg-blue-50/60" : "hover:bg-slate-50/60"}
                    >
                      <td
                        className={`px-4 py-2 font-medium ${isRef ? "text-blue-700" : "text-slate-700"}`}
                      >
                        {row.finishers}
                        {isRef && (
                          <span className="ml-2 text-xs font-normal text-blue-400">
                            reference*
                          </span>
                        )}
                      </td>
                      <td
                        className={`px-4 py-2 text-right font-extrabold tabular-nums ${isRef ? "text-blue-700" : "text-slate-700"}`}
                      >
                        {row.coeff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            * 300 finishers per distance = 1.00. Races with more finishers
            reward more points.
          </p>
        </div>

        <div>
          <h2 className="text-base font-bold text-slate-800 mb-3">Rules</h2>
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600">
            <ul className="space-y-2 list-disc list-inside marker:text-slate-300">
              <li>Points are awarded per gender.</li>
              <li>Only the top 50 finishers score points.</li>
              <li>Rankings are per distance.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
