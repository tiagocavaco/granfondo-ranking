import type { ReactNode } from "react";

export function SectionLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`text-[10px] font-bold text-slate-600 uppercase tracking-widest ${className}`}
    >
      {children}
    </p>
  );
}
