import React from 'react';
import type { Email, EmailStatus } from '../types/index.js';
import { EmptyState } from './EmptyState.js';
import { Clock, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

interface EmailTableProps {
  emails: Email[];
  tab: 'SCHEDULED' | 'SENT';
  isLoading?: boolean;
}

export const EmailTable: React.FC<EmailTableProps> = ({ emails, tab }) => {
  if (emails.length === 0) {
    return <EmptyState type={tab === 'SCHEDULED' ? 'scheduled' : 'sent'} />;
  }

  const renderStatusBadge = (status: EmailStatus) => {
    switch (status) {
      case 'SCHEDULED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3.5 h-3.5" />
            Scheduled
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Processing
          </span>
        );
      case 'SENT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Sent
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <AlertTriangle className="w-3.5 h-3.5" />
            Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
            {status}
          </span>
        );
    }
  };

  const formatDate = (isoString: string | null) => {
    if (!isoString) return '—';
    try {
      return new Date(isoString).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="w-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden my-4">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <th className="py-3.5 px-4 sm:px-6">Recipient</th>
              <th className="py-3.5 px-4 sm:px-6">Subject</th>
              <th className="py-3.5 px-4 sm:px-6">
                {tab === 'SCHEDULED' ? 'Scheduled Delivery' : 'Sent Time'}
              </th>
              <th className="py-3.5 px-4 sm:px-6">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {emails.map((email) => (
              <tr key={email.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="py-4 px-4 sm:px-6 font-medium text-slate-900">
                  <div>
                    {email.recipientName ? (
                      <div>
                        <span className="font-semibold text-slate-900">{email.recipientName}</span>
                        <span className="text-xs text-slate-500 block">{email.recipientEmail}</span>
                      </div>
                    ) : (
                      <span className="text-slate-800">{email.recipientEmail}</span>
                    )}
                  </div>
                </td>
                <td className="py-4 px-4 sm:px-6 text-slate-700 max-w-xs sm:max-w-md truncate">
                  <span className="font-medium text-slate-900">{email.subject || '(No Subject)'}</span>
                  {email.lastError && (
                    <p className="text-xs text-rose-500 truncate mt-0.5" title={email.lastError}>
                      Error: {email.lastError}
                    </p>
                  )}
                </td>
                <td className="py-4 px-4 sm:px-6 text-slate-500 whitespace-nowrap">
                  {tab === 'SCHEDULED' ? formatDate(email.scheduledAt) : formatDate(email.sentAt)}
                </td>
                <td className="py-4 px-4 sm:px-6 whitespace-nowrap">
                  {renderStatusBadge(email.status)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
