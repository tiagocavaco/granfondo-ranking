import type { ReactNode } from "react";

export function RulesList({ items }: { items: ReactNode[] }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#0c1628] px-6 py-5 text-sm text-slate-400">
      <ol className="space-y-3">
        {items.map((item, idx) => (
          <li key={idx} className="flex gap-3 items-start">
            <span className="shrink-0 text-[10px] font-black text-slate-700 tabular-nums mt-0.5 w-4">
              {String(idx + 1).padStart(2, "0")}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
