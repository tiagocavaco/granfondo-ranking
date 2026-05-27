type BadgeColor = "gray" | "blue" | "green" | "red" | "amber";

const colors: Record<BadgeColor, string> = {
  gray: "bg-gray-100 text-gray-600",
  blue: "bg-blue-100 text-blue-700",
  green: "bg-green-100 text-green-700",
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-700",
};

export default function Badge({
  children,
  color = "gray",
}: {
  children: React.ReactNode;
  color?: BadgeColor;
}) {
  return (
    <span className={`inline-block text-xs px-1.5 py-0.5 rounded font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}
