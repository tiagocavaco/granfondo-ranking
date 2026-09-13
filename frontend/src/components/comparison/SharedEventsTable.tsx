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
          <h2 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-3">{year}</h2>
          <div className="rounded-2xl border border-white/[0.07] overflow-hidden bg-[#0c1628]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#060d1a] text-[10px] text-slate-600 uppercase tracking-widest border-b border-white/[0.05]">
                  <th className="px-4 py-2.5 text-left font-bold">Event</th>
                  <th className="px-4 py-2.5 text-left hidden sm:table-cell w-24 font-bold">
                    Distance
                  </th>
                  <th
                    className="px-4 py-2.5 text-center w-24 font-bold"
                    style={{ color: COLORS[0] }}
                  >
                    {aName.split(" ")[0]}
                  </th>
                  <th
                    className="px-4 py-2.5 text-center w-24 font-bold"
                    style={{ color: COLORS[1] }}
                  >
                    {bName.split(" ")[0]}
                  </th>
                  <th className="px-4 py-2.5 text-center hidden md:table-cell w-16 font-bold">
                    Winner
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {byYear[year]!.map((p, i) => {
                  const aWon = p.a.pos < p.b.pos;
                  const tie = p.a.pos === p.b.pos;
                  return (
                    <tr
                      key={i}
                      className="hover:bg-white/[0.03] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link
                          to={`/event/${p.a.eventId}`}
                          className="font-semibold text-slate-200 hover:text-blue-300 transition-colors"
                        >
                          {p.a.eventName}
                        </Link>
                        <div className="text-xs text-slate-600">
                          {p.a.eventDate}
                        </div>
                        <div className="sm:hidden text-xs text-slate-600 mt-0.5">
                          {p.a.distance}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-xs text-slate-600">
                          {p.a.distance}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3 text-center font-mono text-xs font-semibold ${aWon ? "text-blue-400" : "text-slate-500"}`}
                      >
                        <div>#{p.a.pos}</div>
                        <div className="text-slate-600 font-normal">
                          {p.a.raceTime}
                        </div>
                      </td>
                      <td
                        className={`px-4 py-3 text-center font-mono text-xs font-semibold ${!aWon && !tie ? "text-rose-400" : "text-slate-500"}`}
                      >
                        <div>#{p.b.pos}</div>
                        <div className="text-slate-600 font-normal">
                          {p.b.raceTime}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center hidden md:table-cell text-sm">
                        {tie
                          ? <span className="text-slate-600">—</span>
                          : aWon
                          ? <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500" />
                          : <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500" />}
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
