import React from "react";

export function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="animate-spin rounded-full h-8 w-8 border-[3px] border-white/10 border-t-blue-400" />
    </div>
  );
}

export function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-red-500/10 border border-red-500/20 text-red-300 rounded-xl p-4 text-sm">
      {children}
    </div>
  );
}
