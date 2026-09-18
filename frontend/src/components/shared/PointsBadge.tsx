export function PointsBadge({ points }: { points: number | string }) {
  return (
    <span className="font-bold text-blue-300 bg-blue-500/15 px-2 py-0.5 rounded border border-blue-500/20">
      +{points}
    </span>
  );
}
