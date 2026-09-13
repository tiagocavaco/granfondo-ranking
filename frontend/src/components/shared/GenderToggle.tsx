export function GenderToggle({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex rounded-xl border border-white/[0.07] overflow-hidden bg-[#0c1628] shrink-0">
      {[
        { v: "M", label: "Men" },
        { v: "F", label: "Women" },
      ].map(({ v, label }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-3 py-1.5 text-sm font-semibold transition-all ${
            value === v
              ? v === "M"
                ? "bg-blue-500/30 text-blue-300 border border-blue-500/30"
                : "bg-pink-500/25 text-pink-300 border border-pink-500/30"
              : "text-slate-500 hover:text-slate-200 hover:bg-white/5"
          }`}
        >
          <span className="sm:hidden">{v}</span>
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
