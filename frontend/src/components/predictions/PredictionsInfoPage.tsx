import { useNavigate } from "react-router-dom";
import { FormulaBox } from "../shared/FormulaBox";
import { RulesList } from "../shared/RulesList";
import { SectionLabel } from "../shared/SectionLabel";
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
        className="text-sm text-slate-500 hover:text-slate-300 transition-colors mb-4 inline-flex items-center gap-1 group"
      >
        <span className="group-hover:-translate-x-0.5 transition-transform">←</span> Back
      </button>

      <div className="mb-8">
        <div className="text-[10px] font-black tracking-[0.3em] text-blue-500/70 uppercase mb-2">
          Pre-Race Predictions
        </div>
        <h1 className="font-display font-bold text-4xl sm:text-5xl text-white tracking-wide uppercase leading-none mb-3">
          How it works
        </h1>
        <p className="text-slate-500 text-sm">
          Favorites are ranked by a weighted career score that accounts for the
          relevance of each distance to the upcoming race.
        </p>
      </div>

      <FormulaBox>
        <div className="text-blue-300">
          score = Σ points[dist, year] × dist_coeff × year_coeff
        </div>
        <div className="text-slate-500 mt-1 text-xs">
          summed across all (distance, year) pairs the athlete has scored in
        </div>
      </FormulaBox>

      <div className="sm:flex sm:gap-6 mb-8">
        {/* Left column: Distance coefficient + Year decay stacked */}
        <div className="sm:flex-1 space-y-6">
          {/* Coefficient matrix */}
          <div>
            <SectionLabel className="mb-3">Distance coefficients</SectionLabel>
            <div className="rounded-2xl border border-white/[0.07] overflow-hidden bg-[#0c1628] overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#060d1a] text-[10px] text-slate-600 uppercase tracking-widest border-b border-white/[0.05]">
                    <th className="px-4 py-2.5 font-bold"></th>
                    {DISTANCES.map((d) => (
                      <th key={d} className="px-3 py-2.5 text-center font-bold">
                        <span className="sm:hidden">
                          {DISTANCE_ABBR[d] ?? d}
                        </span>
                        <span className="hidden sm:inline">{d}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {DISTANCES.map((hist) => (
                    <tr key={hist} className="hover:bg-white/[0.03] transition-colors">
                      <td className="px-4 py-2 text-slate-400 font-medium">
                        <span className="sm:hidden">
                          {DISTANCE_ABBR[hist] ?? hist}
                        </span>
                        <span className="hidden sm:inline">{hist}</span>
                      </td>
                      {DISTANCES.map((reg) => {
                        const coeff = predictionDistCoeff(reg, hist);
                        const isSame = reg === hist;
                        return (
                          <td
                            key={reg}
                            className={`px-3 py-2 text-center font-black tabular-nums ${
                              isSame
                                ? "text-blue-400"
                                : coeff > 1
                                  ? "text-emerald-400"
                                  : "text-slate-600"
                            }`}
                          >
                            {coeff.toFixed(1)}×
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-600 mt-3">
              Rows = historical distance. Columns = registered distance for the
              upcoming race.
            </p>
          </div>

          {/* Year decay */}
          <div>
            <SectionLabel className="mb-3">Year decay</SectionLabel>
            <div className="rounded-2xl border border-white/[0.07] overflow-hidden bg-[#0c1628]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#060d1a] text-[10px] text-slate-600 uppercase tracking-widest border-b border-white/[0.05]">
                    <th className="px-4 py-2.5 text-left font-bold">Season</th>
                    <th className="px-4 py-2.5 text-right font-bold">Coefficient</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {Array.from({ length: 5 }, (_, i) => {
                    const currentYear = new Date().getFullYear();
                    const year = currentYear - i;
                    const coeff = predictionYearCoeff(year, currentYear);
                    return (
                      <tr
                        key={year}
                        className={i === 0 ? "bg-blue-500/10" : "hover:bg-white/[0.03] transition-colors"}
                      >
                        <td className={`px-4 py-2 font-medium ${i === 0 ? "text-blue-300" : "text-slate-300"}`}>
                          {year}
                          {i === 0 && (
                            <span className="ml-2 text-xs font-normal text-blue-500">
                              current
                            </span>
                          )}
                        </td>
                        <td className={`px-4 py-2 text-right font-black tabular-nums ${i === 0 ? "text-blue-300" : "text-slate-300"}`}>
                          {coeff.toFixed(1)}×
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-white/[0.02]">
                    <td className="px-4 py-2 text-slate-600 text-xs">
                      {new Date().getFullYear() - 10} and earlier
                    </td>
                    <td className="px-4 py-2 text-right text-slate-600 text-xs">
                      0×
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-600 mt-3">
              Each year back loses {PRED_YEAR_STEP * 100}%. Results older than
              10 years contribute nothing.
            </p>
          </div>
        </div>

        {/* Right column: Rules */}
        <div className="sm:flex-1 mt-6 sm:mt-0">
          <SectionLabel className="mb-3">Rules</SectionLabel>
          <RulesList items={[
            "Only athletes whose registration is linked to an existing profile are ranked.",
            <>Participants with no profile are counted as <span className="font-medium text-slate-300">unranked</span> in each category.</>,
            "An athlete strong in longer distances is rewarded when racing shorter — dropping from Granfondo to Minifondo adds a 1.4× bonus.",
            "Moving up in distance is penalized — a Minifondo specialist in a Granfondo scores at 0.6× of their career points.",
            "Time Trial points are isolated and do not count toward road race predictions.",
            "Favorites are shown per category, with an overall male/female leader across all categories.",
          ]} />
        </div>
      </div>
    </div>
  );
}
