import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { countryFlag } from "@granfondo/database/normalize";

type Member = {
  id: number;
  name: string;
  country: string;
  category: string;
  races: number;
  podiums: number;
};

const LIMIT = 10;

export function TeamMemberList({ members }: { members: Member[] }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);

  const searchTerm = search.trim().toLowerCase();
  const filtered = searchTerm
    ? members.filter(
        (m) =>
          m.name.toLowerCase().includes(searchTerm) ||
          m.category.toLowerCase().includes(searchTerm),
      )
    : members;
  const showExpand = !expanded && !searchTerm && filtered.length > LIMIT;
  const visible = showExpand ? filtered.slice(0, LIMIT) : filtered;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
          Members <span className="text-slate-700">({members.length})</span>
        </h2>
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setExpanded(false);
          }}
          placeholder="Name or category…"
          className="w-48 sm:w-56 px-3 py-1.5 text-sm rounded-xl input-dark focus:outline-none placeholder-slate-600"
        />
      </div>
      <div className="rounded-2xl border border-white/[0.07] overflow-hidden bg-[#0c1628]">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col />
            <col className="hidden sm:table-column w-28" />
            <col className="w-12 sm:w-20" />
            <col className="w-20 sm:w-28" />
          </colgroup>
          <thead>
            <tr className="bg-[#060d1a] text-xs text-slate-500 uppercase tracking-wider border-b border-white/[0.06]">
              <th className="px-4 py-3 text-left">Athlete</th>
              <th className="px-4 py-3 text-left hidden sm:table-cell">
                Category
              </th>
              <th className="px-2 sm:px-4 py-3 text-center">Races</th>
              <th className="px-2 sm:px-4 py-3 text-center">Podiums</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-sm text-slate-600"
                >
                  No members match
                </td>
              </tr>
            ) : (
              visible.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => navigate(`/athlete/${m.id}`)}
                  className="hover:bg-white/[0.03] cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      <Link
                        to={`/athlete/${m.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 font-semibold text-slate-100 hover:text-blue-300 transition-colors"
                      >
                        {m.country && (
                          <span className="shrink-0" title={m.country}>
                            {countryFlag(m.country)}
                          </span>
                        )}
                        <span className="truncate">{m.name}</span>
                      </Link>
                      {m.category && (
                        <div className="sm:hidden text-xs font-normal text-slate-600 mt-0.5">
                          {m.category}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 hidden sm:table-cell">
                    {m.category}
                  </td>
                  <td className="px-2 sm:px-4 py-3 text-center text-slate-500 font-medium">
                    {m.races}
                  </td>
                  <td className="px-2 sm:px-4 py-3 text-center">
                    {m.podiums > 0 ? (
                      <span className="font-semibold text-amber-400">
                        {m.podiums}
                      </span>
                    ) : (
                      <span className="text-slate-700">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {showExpand && (
          <button
            onClick={() => setExpanded(true)}
            className="w-full py-3 text-sm text-blue-400 hover:text-blue-300 font-medium border-t border-white/[0.06] hover:bg-white/[0.03] transition-colors"
          >
            Show all {filtered.length} members ↓
          </button>
        )}
      </div>
    </div>
  );
}
