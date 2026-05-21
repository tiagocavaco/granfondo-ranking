import { useEffect, useRef, useState } from "react";

/**
 * Infinite scroll hook.
 * Returns a sentinel ref to attach to a div at the bottom of the list,
 * and the current visible count. Resets to `pageSize` whenever `resetKey` changes.
 */
export function useInfiniteScroll(total: number, resetKey: unknown, pageSize = 100) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset when filters / data source changes
  useEffect(() => { setVisibleCount(pageSize); }, [resetKey, pageSize]);

  // Reconnect observer whenever visibleCount changes so it re-checks immediately
  useEffect(() => {
    if (visibleCount >= total) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting) setVisibleCount((n) => n + pageSize); },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visibleCount, total, pageSize]);

  return { visibleCount, sentinelRef };
}
