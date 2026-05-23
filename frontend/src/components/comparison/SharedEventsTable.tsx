import { Link } from "react-router-dom";
import type { AthleteResultRef } from "@granfondo/database/types";

const COLORS = ["#3b82f6", "#f43f5e"] as const;

type SharedPair = { a: AthleteResultRef; b: AthleteResultRef };

interface Props {
  shared: SharedPair[];
  aName: string;
  bName: string;
}

export function SharedEventsTable({ shared, aName, bName }: Props) {
  const byYear = shared.reduce<Record<number, SharedPair[]>>((acc, p) => {
    const y = new Date(p.a.eventDate).getFullYear();
    (acc[y] ??= []).push(p);
    return acc;
  }, {});
  const years = Object.keys(byYear)
    .map(Number)
    .sort((a, b) => b - a);

  return (
    <>
      {years.map((year) => (
        <div key={year} className="mb-8">
          <h2 className="text-lg font-bold text-slate-800 mb-3">{year}</h2>
          <div className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-4 py-2.5 text-left">Event</th>
                  <th className="px-4 py-2.5 text-left hidden sm:table-cell w-24">
                    Distance
                  </th>
                  <th
                    className="px-4 py-2.5 text-center w-24"
                    style={{ color: COLORS[0] }}
                  >
                    {aName.split(" ")[0]}
                  </th>
                  <th
                    className="px-4 py-2.5 text-center w-24"
                    style={{ color: COLORS[1] }}
                  >
                    {bName.split(" ")[0]}
                  </th>
                  <th className="px-4 py-2.5 text-center hidden md:table-cell w-16">
                    Winner
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byYear[year]!.map((p, i) => {
                  const aWon = p.a.pos < p.b.pos;
                  const tie = p.a.pos === p.b.pos;
                  return (
                    <tr
                      key={i}
                      className="hover:bg-slate-50/60 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link
                          to={`/event/${p.a.eventId}`}
                          className="font-semibold text-slate-900 hover:text-blue-600 transition-colors"
                        >
                          {p.a.eventName}
                        </Link>
                        <div className="text-xs text-slate-400">
                          {p.a.eventDate}
                        </div>
                        <div className="sm:hidden text-xs text-slate-400 mt-0.5">
                          {p.a.distance}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-xs text-slate-500">
                          {p.a.distance}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3 text-center font-mono text-xs font-semibold ${aWon ? "text-blue-600" : "text-slate-500"}`}
                      >
                        <div>#{p.a.pos}</div>
                        <div className="text-slate-400 font-normal">
                          {p.a.raceTime}
                        </div>
                      </td>
                      <td
                        className={`px-4 py-3 text-center font-mono text-xs font-semibold ${!aWon && !tie ? "text-rose-500" : "text-slate-500"}`}
                      >
                        <div>#{p.b.pos}</div>
                        <div className="text-slate-400 font-normal">
                          {p.b.raceTime}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center hidden md:table-cell text-sm">
                        {tie ? "—" : aWon ? "🔵" : "🔴"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}
