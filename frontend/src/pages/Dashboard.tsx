import React, { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/Layout.js';
import { EmailTable } from '../components/EmailTable.js';
import { LoadingState } from '../components/LoadingState.js';
import { ErrorState } from '../components/ErrorState.js';
import { emailApi } from '../lib/api.js';
import type { Email, EmailStatus } from '../types/index.js';
import { Clock, CheckCircle2, Search, X, RefreshCw } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'SCHEDULED' | 'SENT'>('SCHEDULED');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');

  const [emails, setEmails] = useState<Email[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce search query input (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchEmails = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      let response;
      if (debouncedQuery) {
        // Use Elasticsearch search endpoint when a search query is typed
        response = await emailApi.searchEmails({
          q: debouncedQuery,
          status: activeTab as EmailStatus,
          page: 1,
          limit: 50,
        });
      } else {
        // Regular list endpoint
        response = await emailApi.getEmails({
          status: activeTab as EmailStatus,
          page: 1,
          limit: 50,
        });
      }

      setEmails(response.data || []);
      setTotalCount(response.pagination?.total ?? (response.data?.length || 0));
    } catch (err: any) {
      console.error('Failed to fetch emails:', err);
      setError(err?.response?.data?.error || err?.message || 'Failed to load email records.');
      setEmails([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, debouncedQuery]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header Title & Action Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Email Dashboard
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Monitor scheduled deliveries, worker queues, and completed email tasks
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchEmails()}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              title="Refresh email list"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Tab & Search Bar Container */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4 md:space-y-0 md:flex md:items-center md:justify-between">
          {/* Tabs */}
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg w-fit">
            <button
              onClick={() => setActiveTab('SCHEDULED')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all cursor-pointer ${
                activeTab === 'SCHEDULED'
                  ? 'bg-white text-indigo-600 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Scheduled</span>
            </button>

            <button
              onClick={() => setActiveTab('SENT')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all cursor-pointer ${
                activeTab === 'SENT'
                  ? 'bg-white text-indigo-600 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Sent</span>
            </button>
          </div>

          {/* Elasticsearch Search Bar */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search recipient, subject, body..."
              className="w-full pl-9 pr-9 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 placeholder-slate-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Status Info bar */}
        {debouncedQuery && (
          <div className="text-sm text-slate-600 flex items-center justify-between px-1">
            <span>
              Search results for <span className="font-semibold text-slate-900">"{debouncedQuery}"</span> in {activeTab.toLowerCase()} emails
            </span>
            <span className="text-xs text-slate-500">{totalCount} result(s) found</span>
          </div>
        )}

        {/* Content Area */}
        {isLoading ? (
          <LoadingState rows={6} />
        ) : error ? (
          <ErrorState message={error} onRetry={() => fetchEmails()} />
        ) : (
          <EmailTable emails={emails} tab={activeTab} />
        )}
      </div>
    </Layout>
  );
};
