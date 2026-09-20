import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@granfondo/api";
import { formatAge } from "../../utils/date";

export function Footer() {
  const [scrapedAt, setScrapedAt] = useState<string>("");

  useEffect(() => {
    api
      .getStats()
      .then((s) => setScrapedAt(s.scrapedAt))
      .catch(() => {});
  }, []);

  return (
    <footer className="border-t border-white/[0.06] mt-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-slate-500">
            Granfondo Portugal
          </span>
          <Link
            to="/privacy"
            className="hover:text-slate-400 transition-colors"
          >
            Privacy
          </Link>
          <Link to="/terms" className="hover:text-slate-400 transition-colors">
            Terms
          </Link>
        </div>
        {scrapedAt && (
          <span className="text-slate-600">
            Data updated {formatAge(scrapedAt)}
          </span>
        )}
      </div>
    </footer>
  );
}
