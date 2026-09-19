import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-6 text-center">
      <div className="text-[10px] font-black tracking-[0.3em] text-blue-500/70 uppercase">
        Page not found
      </div>
      <h1 className="font-display font-bold text-5xl sm:text-6xl text-white tracking-wide uppercase">
        404
      </h1>
      <p className="text-slate-400 text-sm max-w-xs">
        This page doesn&apos;t exist. Check the URL or go back to the homepage.
      </p>
      <Link
        to="/"
        className="mt-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
      >
        Back to events
      </Link>
    </div>
  );
}
