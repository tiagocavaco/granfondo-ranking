export function GenderToggle({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm shrink-0">
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
                ? "bg-blue-600 text-white"
                : "bg-pink-500 text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span className="sm:hidden">{v}</span>
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
