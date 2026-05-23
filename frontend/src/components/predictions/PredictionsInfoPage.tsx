import { useNavigate } from "react-router-dom";
import {
  DISTANCES,
  DISTANCE_ABBR,
  predictionDistCoeff,
  predictionYearCoeff,
  PRED_YEAR_STEP,
} from "@granfondo/utils/distance";

export default function PredictionsInfoPage() {
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
        Predictions — How it works
      </h1>
      <p className="text-slate-500 text-sm mb-8">
        Favorites are ranked by a weighted career score that accounts for the
        relevance of each distance to the upcoming race.
      </p>

      {/* Formula */}
      <div className="bg-slate-900 text-white rounded-2xl px-6 py-5 mb-8 font-mono text-sm">
        <div className="text-slate-400 text-xs uppercase tracking-widest mb-2">
          Formula
        </div>
        <div className="text-blue-300">
          score = Σ points[dist, year] × dist_coeff × year_coeff
        </div>
        <div className="text-slate-400 mt-1 text-xs">
          summed across all (distance, year) pairs the athlete has scored in
        </div>
      </div>

      <div className="sm:flex sm:gap-6 mb-8">
        {/* Left column: Distance coefficient + Year decay stacked */}
        <div className="sm:flex-1 space-y-6">
          {/* Coefficient matrix */}
          <div>
            <h2 className="text-base font-bold text-slate-800 mb-3">
              Distance coefficients
            </h2>
            <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <th className="px-4 py-2"></th>
                    {DISTANCES.map((d) => (
                      <th key={d} className="px-3 py-2 text-center">
                        <span className="sm:hidden">
                          {DISTANCE_ABBR[d] ?? d}
                        </span>
                        <span className="hidden sm:inline">{d}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {DISTANCES.map((hist) => (
                    <tr key={hist} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2 text-slate-700 font-medium">
                        <span className="sm:hidden">
                          {DISTANCE_ABBR[hist] ?? hist}
                        </span>
                        <span className="hidden sm:inline">{hist}</span>
                      </td>
                      {DISTANCES.map((reg) => {
                        const c = predictionDistCoeff(reg, hist);
                        const isSame = reg === hist;
                        return (
                          <td
                            key={reg}
                            className={`px-3 py-2 text-center font-extrabold tabular-nums ${
                              isSame
                                ? "text-blue-700"
                                : c > 1
                                  ? "text-emerald-600"
                                  : "text-slate-400"
                            }`}
                          >
                            {c.toFixed(1)}×
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              Rows = historical distance. Columns = registered distance for the
              upcoming race.
            </p>
          </div>

          {/* Year decay */}
          <div>
            <h2 className="text-base font-bold text-slate-800 mb-3">
              Year decay
            </h2>
            <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <th className="px-4 py-2 text-left">Season</th>
                    <th className="px-4 py-2 text-right">Coefficient</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Array.from({ length: 5 }, (_, i) => {
                    const currentYear = new Date().getFullYear();
                    const year = currentYear - i;
                    const coeff = predictionYearCoeff(year, currentYear);
                    return (
                      <tr
                        key={year}
                        className={
                          i === 0 ? "bg-blue-50/60" : "hover:bg-slate-50/60"
                        }
                      >
                        <td
                          className={`px-4 py-2 font-medium ${i === 0 ? "text-blue-700" : "text-slate-700"}`}
                        >
                          {year}
                          {i === 0 && (
                            <span className="ml-2 text-xs font-normal text-blue-400">
                              current
                            </span>
                          )}
                        </td>
                        <td
                          className={`px-4 py-2 text-right font-extrabold tabular-nums ${i === 0 ? "text-blue-700" : "text-slate-700"}`}
                        >
                          {coeff.toFixed(1)}×
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50/40">
                    <td className="px-4 py-2 text-slate-400 text-xs">
                      {new Date().getFullYear() - 10} and earlier
                    </td>
                    <td className="px-4 py-2 text-right text-slate-400 text-xs">
                      0×
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              Each year back loses {PRED_YEAR_STEP * 100}%. Results older than
              10 years contribute nothing.
            </p>
          </div>
        </div>

        {/* Right column: Rules */}
        <div className="sm:flex-1 mt-6 sm:mt-0">
          <h2 className="text-base font-bold text-slate-800 mb-3">Rules</h2>
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600">
            <ul className="space-y-2 list-disc list-inside marker:text-slate-300">
              <li>
                Only athletes whose registration is linked to an existing
                profile are ranked.
              </li>
              <li>
                Participants with no profile are counted as{" "}
                <span className="font-medium text-slate-700">unranked</span> in
                each category.
              </li>
              <li>
                An athlete strong in longer distances is rewarded when racing
                shorter — dropping from Granfondo to Minifondo adds a 1.4×
                bonus.
              </li>
              <li>
                Moving up in distance is penalized — a Minifondo specialist in a
                Granfondo scores at 0.6× of their career points.
              </li>
              <li>
                Time Trial points are isolated and do not count toward road race
                predictions.
              </li>
              <li>
                Favorites are shown per category, with an overall male/female
                leader across all categories.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
