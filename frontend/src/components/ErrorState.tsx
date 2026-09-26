import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  message = 'An unexpected error occurred while loading data.',
  onRetry,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-red-50/50 rounded-xl border border-red-200 text-center my-4">
      <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
      <h3 className="text-md font-semibold text-red-800 mb-1">Failed to load content</h3>
      <p className="text-sm text-red-600 mb-4 max-w-md">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-lg hover:bg-red-50 transition-colors shadow-sm cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      )}
    </div>
  );
};
