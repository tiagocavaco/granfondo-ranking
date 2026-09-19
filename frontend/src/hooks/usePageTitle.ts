import { useEffect } from "react";

const SITE = "Granfondo Portugal";

export function usePageTitle(title?: string): void {
  useEffect(() => {
    document.title = title ? `${SITE} · ${title}` : SITE;
    return () => {
      document.title = SITE;
    };
  }, [title]);
}
