import type { Ref } from "react";

export function ScrollSentinel({
  sentinelRef,
  visible,
  total,
}: {
  sentinelRef: Ref<HTMLDivElement>;
  visible: number;
  total: number;
}) {
  if (visible >= total) {
    return null;
  }

  return (
    <div
      ref={sentinelRef}
      className="px-4 py-3 text-xs text-slate-600 border-t border-white/[0.06] text-center"
    >
      Showing {visible} of {total}…
    </div>
  );
}
