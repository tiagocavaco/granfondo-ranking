import type { ReactNode } from "react";

export const ghostButtonClass =
  "mt-2 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold text-slate-400 border border-white/[0.1] hover:text-white hover:border-white/25 transition-colors";

type Props = {
  label: string;
  description: string;
  action: ReactNode;
};

export function NotFoundState({ label, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-6 text-center">
      <div className="text-[10px] font-black tracking-[0.3em] text-blue-500/70 uppercase">
        {label}
      </div>
      <h1 className="font-display font-bold text-5xl sm:text-6xl text-white tracking-wide uppercase">
        404
      </h1>
      <p className="text-slate-400 text-sm max-w-xs">{description}</p>
      {action}
    </div>
  );
}
