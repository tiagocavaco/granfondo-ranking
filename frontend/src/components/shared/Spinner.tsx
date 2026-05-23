import React from "react";

export function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="animate-spin rounded-full h-8 w-8 border-[3px] border-slate-200 border-t-blue-600" />
    </div>
  );
}

export function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
      {children}
    </div>
  );
}
