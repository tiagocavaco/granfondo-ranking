export function GenderBadge({
  gender,
  variant = "chip",
}: {
  gender: string;
  variant?: "chip" | "hero";
}) {
  const isFemale = gender === "F";
  if (variant === "hero") {
    return (
      <span
        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-widest ${
          isFemale
            ? "bg-pink-500/15 text-pink-300 border border-pink-500/20"
            : "bg-blue-500/15 text-blue-300 border border-blue-500/20"
        }`}
      >
        {isFemale ? "Women" : "Men"}
      </span>
    );
  }
  return (
    <span
      className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
        isFemale
          ? "bg-pink-500/15 text-pink-300"
          : "bg-blue-500/15 text-blue-300"
      }`}
    >
      {gender}
    </span>
  );
}
