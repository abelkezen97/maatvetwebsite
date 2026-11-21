import React from "react";

interface LoadingSkeletonProps {
  type: "card" | "table" | "list" | "form" | "dashboard";
  count?: number;
}

export function LoadingSkeleton({ type, count = 3 }: LoadingSkeletonProps) {
  const items = Array.from({ length: count });

  if (type === "form") {
    return (
      <div className="animate-pulse w-full max-w-6xl mx-auto bg-white border border-slate-200 rounded-lg shadow-sm">
        <div className="p-5 md:p-8 space-y-5 max-w-3xl">
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-2 sm:gap-6 items-center">
              <div className="h-4 w-28 bg-slate-100 rounded-lg" />
              <div className="h-10 w-full bg-slate-100 rounded-md" />
            </div>
          ))}
        </div>
        <div className="border-t border-slate-200 p-5 md:p-8 space-y-3">
          <div className="h-4 w-24 bg-slate-100 rounded-lg" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 w-full bg-slate-50 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (type === "dashboard") {
    return (
      <div className="animate-pulse w-full space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="h-3 w-20 bg-slate-100 rounded-lg" />
              <div className="h-7 w-28 bg-slate-100 rounded-lg" />
              <div className="h-3 w-16 bg-slate-100 rounded-lg" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3">
              <div className="h-4 w-40 bg-slate-100 rounded-lg" />
              <div className="h-36 w-full bg-slate-50 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "card") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full">
        {items.map((_, i) => (
          <div key={i} className="animate-pulse bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <div className="h-4 w-24 bg-slate-100 rounded-lg" />
              <div className="h-10 w-10 bg-slate-100 rounded-full" />
            </div>
            <div className="h-8 w-20 bg-slate-100 rounded-lg" />
            <div className="h-3.5 w-36 bg-slate-100 rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  if (type === "table") {
    return (
      <div className="animate-pulse space-y-4 w-full bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
          <div className="h-5 w-48 bg-slate-100 rounded-lg" />
          <div className="h-9 w-24 bg-slate-100 rounded-lg" />
        </div>
        <div className="space-y-3">
          {items.map((_, i) => (
            <div key={i} className="flex justify-between items-center py-3 border-b border-slate-50 last:border-0">
              <div className="h-4 w-1/4 bg-slate-100 rounded-lg" />
              <div className="h-4 w-1/6 bg-slate-100 rounded-lg" />
              <div className="h-4 w-1/6 bg-slate-100 rounded-lg" />
              <div className="h-4 w-1/12 bg-slate-100 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full">
      {items.map((_, i) => (
        <div key={i} className="animate-pulse flex items-center space-x-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="w-12 h-12 bg-slate-100 rounded-full" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 bg-slate-100 rounded-lg w-1/4" />
            <div className="h-3 bg-slate-100 rounded-lg w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
