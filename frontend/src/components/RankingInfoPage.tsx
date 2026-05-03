import { useNavigate } from "react-router-dom";
import {
  ATHLETE_POINTS_TABLE,
  ATHLETE_COEFFICIENT_REFERENCE,
  finisherCoefficient,
  TEAM_POINTS_TABLE,
  TEAM_COEFFICIENT_REFERENCE,
  teamCoefficient,
} from "@granfondo/utils/scoring";

function ordinal(n: number) {
  if (n === 1) return "st"; if (n === 2) return "nd"; if (n === 3) return "rd"; return "th";
}

const ATHLETE_POINTS = (() => {
  let prev = 0;
  return ATHLETE_POINTS_TABLE.map(({ maxPos, points }) => {
    const label = maxPos === prev + 1
      ? `${maxPos}${ordinal(maxPos)}`
      : `${prev + 1}–${maxPos}`;
    prev = maxPos;
    return { pos: label, pts: points };
  });
})();

const TEAM_POINTS = TEAM_POINTS_TABLE.map(({ maxRank, points }) => ({
  rank: `${maxRank}${ordinal(maxRank)}`,
  pts: points,
}));

const ATHLETE_COEFF_SAMPLES = [75, 150, ATHLETE_COEFFICIENT_REFERENCE, 600, 900].map((f) => ({
  finishers: f, coeff: finisherCoefficient(f).toFixed(2),
}));

const TEAM_COEFF_SAMPLES = [5, 10, TEAM_COEFFICIENT_REFERENCE, 50, 100].map((t) => ({
  teams: t, coeff: teamCoefficient(t).toFixed(2),
}));

export default function RankingInfoPage({ mode }: { mode: "athlete" | "team" }) {
  const navigate = useNavigate();
  const isAthlete = mode === "athlete";

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-slate-400 hover:text-slate-600 transition-colors mb-4 inline-flex items-center gap-1"
      >
        ← Back
      </button>

      <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
        {isAthlete ? "Athlete Ranking" : "Team Ranking"} — How it works
      </h1>
      <p className="text-slate-500 text-sm mb-8">
        {isAthlete
          ? "Points are awarded per race based on finishing position within your gender, then scaled by a difficulty coefficient based on the number of finishers per distance."
          : "Points are awarded per event based on the sum of finishing positions of a team's top 3 athletes, then scaled by a difficulty coefficient based on how many teams competed."}
      </p>

      {/* Formula */}
      <div className="bg-slate-900 text-white rounded-2xl px-6 py-5 mb-8 font-mono text-sm">
        <div className="text-slate-400 text-xs uppercase tracking-widest mb-2">Formula</div>
        {isAthlete ? (
          <>
            <div className="text-blue-300">points = base_points × coefficient</div>
            <div className="text-slate-400 mt-1 text-xs">coefficient = √(finishers / 300) · rounded to 2 decimal places</div>
          </>
        ) : (
          <>
            <div className="text-blue-300">points = base_points × coefficient</div>
            <div className="text-slate-400 mt-1 text-xs">coefficient = √(eligible_teams / 25) · rounded to 2 decimal places</div>
            <div className="text-slate-400 text-xs">team rank = lowest sum of top 3 finishing positions wins</div>
          </>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-6 mb-8">
        {/* Points table */}
        <div>
          <h2 className="text-base font-bold text-slate-800 mb-3">
            {isAthlete ? "Base points by position" : "Base points by team rank"}
          </h2>
          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-4 py-2 text-left">{isAthlete ? "Gender position" : "Team rank"}</th>
                  <th className="px-4 py-2 text-right">Base pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(isAthlete ? ATHLETE_POINTS : TEAM_POINTS).map((row) => (
                  <tr key={"pos" in row ? row.pos : row.rank} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2 text-slate-700 font-medium">{"pos" in row ? row.pos : row.rank}</td>
                    <td className="px-4 py-2 text-right font-extrabold text-blue-700">{row.pts}</td>
                  </tr>
                ))}
                {isAthlete && (
                  <tr className="bg-slate-50/40">
                    <td className="px-4 py-2 text-slate-400 text-xs">51st+</td>
                    <td className="px-4 py-2 text-right text-slate-400 text-xs">0</td>
                  </tr>
                )}
                {!isAthlete && (
                  <tr className="bg-slate-50/40">
                    <td className="px-4 py-2 text-slate-400 text-xs">11th+</td>
                    <td className="px-4 py-2 text-right text-slate-400 text-xs">0</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Coefficient table */}
        <div>
          <h2 className="text-base font-bold text-slate-800 mb-3">Difficulty coefficient</h2>
          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-4 py-2 text-left">{isAthlete ? "Finishers" : "Teams"}</th>
                  <th className="px-4 py-2 text-right">Coefficient</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(isAthlete ? ATHLETE_COEFF_SAMPLES : TEAM_COEFF_SAMPLES).map((row) => {
                  const val = "finishers" in row ? row.finishers : row.teams;
                  const isRef = (isAthlete && val === ATHLETE_COEFFICIENT_REFERENCE) || (!isAthlete && val === TEAM_COEFFICIENT_REFERENCE);
                  return (
                    <tr key={val} className={isRef ? "bg-blue-50/60" : "hover:bg-slate-50/60"}>
                      <td className={`px-4 py-2 font-medium ${isRef ? "text-blue-700" : "text-slate-700"}`}>
                        {val}{isRef && <span className="ml-2 text-xs font-normal text-blue-400">reference*</span>}
                      </td>
                      <td className={`px-4 py-2 text-right font-extrabold ${isRef ? "text-blue-700" : "text-slate-700"}`}>
                        {row.coeff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            {isAthlete
              ? "* 300 finishers per distance = 1.00. Races with more finishers reward more points."
              : "* 25 eligible teams = 1.00. Races with more teams reward more points."}
          </p>
        </div>
      </div>

      {/* Extra rules */}
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 space-y-3 text-sm text-slate-600">
        <h2 className="text-base font-bold text-slate-800">Rules</h2>
        {isAthlete ? (
          <ul className="space-y-2 list-disc list-inside marker:text-slate-300">
            <li>Points are awarded per gender — men and women have separate rankings.</li>
            <li>Rankings are per distance (Granfondo, Mediofondo, Minifondo, Time Trial).</li>
            <li>Season total is the sum of points across all scored races — there is no cap on how many races count.</li>
            <li>DNF and DNS results do not score.</li>
          </ul>
        ) : (
          <ul className="space-y-2 list-disc list-inside marker:text-slate-300">
            <li>A team must have at least 3 finishers per distance to score — these are the eligible teams used in the coefficient.</li>
            <li>The top 3 finishers' overall race positions are summed — lowest combined score wins (overall position, not gender position).</li>
            <li>Rankings are per distance. Mixed-gender teams are allowed.</li>
            <li>Season total is the sum of points across all scored events — there is no cap on how many events count.</li>
            <li>DNF and DNS athletes do not count towards the team's 3 required finishers.</li>
          </ul>
        )}
      </div>
    </div>
  );
}
