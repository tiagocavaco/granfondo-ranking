export function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div className="flex-1 sm:flex-none text-center bg-white/10 rounded-xl px-4 py-2 border border-white/10">
      <div
        className={`text-xl font-extrabold ${highlight ? "text-amber-400" : "text-white"}`}
      >
        {value}
      </div>
      <div className="text-xs text-blue-300 font-medium mt-0.5">{label}</div>
    </div>
  );
}
