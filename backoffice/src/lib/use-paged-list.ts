import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_PAGE_SIZE = 50;

export function usePagedList<T>(items: T[], pageSize = DEFAULT_PAGE_SIZE) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Reset when the underlying list changes (e.g. filter applied)
  useEffect(() => {
    setVisibleCount(pageSize);
  }, [items, pageSize]);

  const sentinelRef = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    if (!node) return;
    observerRef.current = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisibleCount((prev) => prev + pageSize);
      }
    });
    observerRef.current.observe(node);
  }, []);

  return {
    visible: items.slice(0, visibleCount),
    sentinelRef,
    hasMore: visibleCount < items.length,
  };
}
