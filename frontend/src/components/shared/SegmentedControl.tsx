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
      <div className="flex flex-1 sm:flex-none rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        {options.map((o) => {
          const colors = colorMap?.[o];
          const fullLabel = labelMap?.[o] ?? o;
          const shortLabel = shortLabelMap?.[o];
          const inactiveClass = colors?.base
            ? `text-slate-600 hover:bg-slate-50 border-r last:border-r-0 ${colors.base}`
            : "text-slate-600 hover:bg-slate-50";
          return (
            <button
              key={o}
              onClick={() => onChange(o)}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition-all ${
                value === o
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
