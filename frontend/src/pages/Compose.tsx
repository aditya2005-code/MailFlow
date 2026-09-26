import React from 'react';
import { Layout } from '../components/Layout.js';
import { Send, FileSpreadsheet, Clock, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export const Compose: React.FC = () => {
  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Compose Email Campaign</h1>
            <p className="text-sm text-slate-500">
              Draft, schedule, or bulk upload recipient lists via CSV
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm text-center space-y-6">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto border border-indigo-100 shadow-xs">
            <Send className="w-8 h-8" />
          </div>

          <div className="max-w-md mx-auto space-y-2">
            <h2 className="text-xl font-bold text-slate-900">Campaign Composition UI</h2>
            <p className="text-sm text-slate-500">
              Bulk CSV recipient parsing, rich email composer, and custom scheduling controls will be unlocked in the upcoming Phase 7.2.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto text-left pt-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-3">
              <FileSpreadsheet className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-slate-800">CSV Bulk Import</h4>
                <p className="text-xs text-slate-500">Parse recipient lists with automatic column matching</p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-3">
              <Clock className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-slate-800">BullMQ Scheduling</h4>
                <p className="text-xs text-slate-500">Delay email execution with Redis rate limiter protection</p>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
};
