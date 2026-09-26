import React from 'react';

export const LoadingState: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    <div className="w-full bg-white rounded-xl border border-slate-200 p-6 shadow-sm animate-pulse space-y-4">
      <div className="h-6 bg-slate-200 rounded w-1/4 mb-6"></div>
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
          <div className="space-y-2 flex-1 max-w-md">
            <div className="h-4 bg-slate-200 rounded w-3/4"></div>
            <div className="h-3 bg-slate-150 rounded w-1/2"></div>
          </div>
          <div className="h-4 bg-slate-200 rounded w-24"></div>
          <div className="h-6 bg-slate-200 rounded-full w-20"></div>
        </div>
      ))}
    </div>
  );
};
