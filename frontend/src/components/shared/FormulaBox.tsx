import type { ReactNode } from "react";

export function FormulaBox({ children }: { children: ReactNode }) {
  return (
    <div className="bg-[#0c1628] border border-white/[0.07] rounded-2xl px-6 py-5 mb-8 font-mono text-sm">
      <div className="text-slate-600 text-[10px] uppercase tracking-widest mb-2 font-bold">
        Formula
      </div>
      {children}
    </div>
  );
}
