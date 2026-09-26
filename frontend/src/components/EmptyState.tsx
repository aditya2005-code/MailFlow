import React from 'react';
import { Inbox, Search, Mail } from 'lucide-react';

interface EmptyStateProps {
  type?: 'scheduled' | 'sent' | 'search';
  title?: string;
  description?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  type = 'scheduled',
  title,
  description,
}) => {
  const getIcon = () => {
    switch (type) {
      case 'search':
        return <Search className="w-12 h-12 text-slate-400" />;
      case 'sent':
        return <Mail className="w-12 h-12 text-slate-400" />;
      default:
        return <Inbox className="w-12 h-12 text-slate-400" />;
    }
  };

  const getDefaultTitle = () => {
    switch (type) {
      case 'search':
        return 'No matching emails found';
      case 'sent':
        return 'No sent emails yet';
      default:
        return 'No scheduled emails yet';
    }
  };

  const getDefaultDescription = () => {
    switch (type) {
      case 'search':
        return 'Try adjusting your search query or clear filters.';
      case 'sent':
        return 'Emails delivered by the scheduling worker will appear here.';
      default:
        return 'Emails scheduled for future delivery will appear here.';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-xl border border-slate-200 shadow-sm my-4">
      <div className="p-4 bg-slate-50 rounded-full mb-4">{getIcon()}</div>
      <h3 className="text-lg font-semibold text-slate-800 mb-1">
        {title || getDefaultTitle()}
      </h3>
      <p className="text-sm text-slate-500 max-w-sm">
        {description || getDefaultDescription()}
      </p>
    </div>
  );
};
