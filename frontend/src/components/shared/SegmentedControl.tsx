export function SegmentedControl({
  label,
  options,
  value,
  onChange,
  colorMap,
  labelMap,
  shortLabelMap,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  colorMap?: Record<string, { active: string; base?: string }>;
  labelMap?: Record<string, string>;
  shortLabelMap?: Record<string, string>;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">
        {label}
      </span>
      <div className="flex flex-1 sm:flex-none rounded-xl border border-white/[0.07] overflow-hidden bg-[#0c1628]">
        {options.map((option) => {
          const colors = colorMap?.[option];
          const fullLabel = labelMap?.[option] ?? option;
          const shortLabel = shortLabelMap?.[option];
          const inactiveClass = colors?.base
            ? `text-slate-500 hover:bg-white/5 border-r last:border-r-0 border-white/[0.07]`
            : "text-slate-500 hover:text-slate-200 hover:bg-white/5";
          return (
            <button
              key={option}
              onClick={() => onChange(option)}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition-all ${
                value === option
                  ? (colors?.active ?? "bg-blue-600 text-white")
                  : inactiveClass
              }`}
            >
              {shortLabel ? (
                <>
                  <span className="sm:hidden">{shortLabel}</span>
                  <span className="hidden sm:inline">{fullLabel}</span>
                </>
              ) : (
                fullLabel
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
