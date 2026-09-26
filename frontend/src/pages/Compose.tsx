import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Layout } from '../components/Layout.js';
import { senderApi, campaignApi, emailApi } from '../lib/api.js';
import { parseRecipientCSV } from '../utils/csvParser.js';
import type { Sender, CSVParseSummary, ParsedRecipient, BulkEmailRequestItem } from '../types/index.js';
import {
  Send,
  FileSpreadsheet,
  Clock,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Upload,
  User,
  Trash2,
  Plus,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export const Compose: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [senders, setSenders] = useState<Sender[]>([]);
  const [selectedSenderId, setSelectedSenderId] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [body, setBody] = useState<string>('');

  // Default start time: +5 minutes from now in YYYY-MM-THH:mm format for datetime-local
  const getDefaultScheduledTime = () => {
    const d = new Date(Date.now() + 5 * 60 * 1000);
    d.setSeconds(0, 0);
    const tzOffset = d.getTimezoneOffset() * 60000;
    const localISOTime = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
    return localISOTime;
  };

  const [scheduledAtStr, setScheduledAtStr] = useState<string>(getDefaultScheduledTime());

  // CSV State
  const [csvSummary, setCsvSummary] = useState<CSVParseSummary | null>(null);
  const [isParsingCsv, setIsParsingCsv] = useState<boolean>(false);
  const [previewPage, setPreviewPage] = useState<number>(1);
  const PREVIEW_PER_PAGE = 10;

  // New Sender Modal State
  const [showAddSender, setShowAddSender] = useState<boolean>(false);
  const [newSenderName, setNewSenderName] = useState<string>('');
  const [newSenderEmail, setNewSenderEmail] = useState<string>('');
  const [isCreatingSender, setIsCreatingSender] = useState<boolean>(false);

  // Status & Submission State
  const [isLoadingSenders, setIsLoadingSenders] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    campaignId: string;
    totalCreated: number;
    senderEmail: string;
    subject: string;
    scheduledAt: string;
  } | null>(null);

  // Fetch authenticated user's senders on mount
  useEffect(() => {
    const loadSenders = async () => {
      try {
        setIsLoadingSenders(true);
        const data = await senderApi.getSenders();
        setSenders(data);
        if (data.length > 0 && data[0]) {
          setSelectedSenderId(data[0].id);
        }
      } catch (err: any) {
        console.error('Failed to fetch senders:', err);
        setFormError('Failed to load senders from backend.');
      } finally {
        setIsLoadingSenders(false);
      }
    };

    loadSenders();
  }, []);

  // Handle Quick Create Sender
  const handleCreateSender = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSenderName.trim() || !newSenderEmail.trim()) {
      alert('Name and email are required for sender identity.');
      return;
    }

    try {
      setIsCreatingSender(true);
      const created = await senderApi.createSender({
        name: newSenderName.trim(),
        email: newSenderEmail.trim(),
      });
      setSenders((prev) => [created, ...prev]);
      setSelectedSenderId(created.id);
      setShowAddSender(false);
      setNewSenderName('');
      setNewSenderEmail('');
    } catch (err: any) {
      alert(err?.response?.data?.error || err?.message || 'Failed to create sender.');
    } finally {
      setIsCreatingSender(false);
    }
  };

  // Handle CSV File Selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setFormError('Please select a valid .csv file.');
      return;
    }

    try {
      setIsParsingCsv(true);
      setFormError(null);
      const summary = await parseRecipientCSV(file);
      setCsvSummary(summary);
      setPreviewPage(1);

      if (summary.validCount === 0) {
        setFormError('No valid email recipients found in the selected CSV file.');
      }
    } catch (err: any) {
      setFormError(err.message || 'Error reading CSV file.');
      setCsvSummary(null);
    } finally {
      setIsParsingCsv(false);
    }
  };

  const handleClearCsv = () => {
    setCsvSummary(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    if (!selectedSenderId) {
      setFormError('Please select a sender identity.');
      return;
    }

    if (!csvSummary || csvSummary.validCount === 0) {
      setFormError('Please upload a valid CSV file containing recipient email addresses.');
      return;
    }

    if (!subject.trim()) {
      setFormError('Email subject is required.');
      return;
    }

    if (!body.trim()) {
      setFormError('Email body content is required.');
      return;
    }

    const scheduledDate = new Date(scheduledAtStr);
    if (isNaN(scheduledDate.getTime())) {
      setFormError('Please select a valid scheduled start date & time.');
      return;
    }

    if (scheduledDate.getTime() < Date.now() - 60000) {
      setFormError('Scheduled time must be in the future.');
      return;
    }

    const selectedSender = senders.find((s) => s.id === selectedSenderId);

    try {
      setIsSubmitting(true);

      // Step 1: Create Campaign
      const campaign = await campaignApi.createCampaign({
        senderId: selectedSenderId,
        name: subject.trim(),
        subject: subject.trim(),
        body: body,
      });

      // Step 2: Prepare items for bulk creation (batch size 500)
      const scheduledIso = scheduledDate.toISOString();
      const recipients: ParsedRecipient[] = csvSummary.validRecipients;

      const bulkItems: BulkEmailRequestItem[] = recipients.map((r) => ({
        recipientEmail: r.email,
        recipientName: r.name,
        subject: subject.trim(),
        body: body,
        scheduledAt: scheduledIso,
      }));

      // Batch in chunks of 500 (MAX_BULK_EMAIL_BATCH_SIZE)
      const BATCH_SIZE = 500;
      let totalCreated = 0;

      for (let i = 0; i < bulkItems.length; i += BATCH_SIZE) {
        const chunk = bulkItems.slice(i, i + BATCH_SIZE);
        const res = await emailApi.bulkCreateEmails(campaign.id, chunk);
        totalCreated += res.data.created;
      }

      setSuccessInfo({
        campaignId: campaign.id,
        totalCreated,
        senderEmail: selectedSender?.email || 'Sender',
        subject: subject.trim(),
        scheduledAt: scheduledDate.toLocaleString(),
      });
    } catch (err: any) {
      console.error('Campaign scheduling failed:', err);
      setFormError(
        err?.response?.data?.error || err?.message || 'Failed to schedule campaign. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Preview Pagination helper
  const paginatedPreview = () => {
    if (!csvSummary) return [];
    const start = (previewPage - 1) * PREVIEW_PER_PAGE;
    return csvSummary.validRecipients.slice(start, start + PREVIEW_PER_PAGE);
  };

  const totalPages = csvSummary
    ? Math.ceil(csvSummary.validRecipients.length / PREVIEW_PER_PAGE)
    : 1;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Navigation & Title */}
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Compose Email Campaign
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Upload recipient list, compose email, and schedule BullMQ delayed delivery
            </p>
          </div>
        </div>

        {/* Success Modal / Card */}
        {successInfo ? (
          <div className="bg-white rounded-2xl border border-emerald-200 p-8 shadow-sm text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-100 shadow-sm">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div className="max-w-md mx-auto space-y-2">
              <h2 className="text-2xl font-bold text-slate-900">Campaign Scheduled Successfully</h2>
              <p className="text-sm text-slate-600">
                Your email jobs have been scheduled into the BullMQ queue and will be processed by the background worker.
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 max-w-lg mx-auto text-left text-sm space-y-2.5">
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-500">Recipients Scheduled:</span>
                <span className="font-semibold text-slate-900">{successInfo.totalCreated} email(s)</span>
              </div>
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-500">Sender Identity:</span>
                <span className="font-semibold text-slate-900">{successInfo.senderEmail}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-500">Subject:</span>
                <span className="font-semibold text-slate-900 truncate max-w-xs">{successInfo.subject}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Scheduled Start Time:</span>
                <span className="font-semibold text-indigo-600">{successInfo.scheduledAt}</span>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => {
                  setSuccessInfo(null);
                  setCsvSummary(null);
                  setSubject('');
                  setBody('');
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="w-full sm:w-auto px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-xs cursor-pointer"
              >
                Compose Another Campaign
              </button>
              <button
                onClick={() => navigate('/dashboard?tab=SCHEDULED')}
                className="w-full sm:w-auto px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-600/20 cursor-pointer"
              >
                View Scheduled Emails
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Global Form Error Banner */}
            {formError && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-sm text-rose-700">
                <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <div className="flex-1">{formError}</div>
              </div>
            )}

            {/* Step 1: Sender Selection */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-semibold text-slate-900">
                  1. Select Sender Identity <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowAddSender(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add New Sender
                </button>
              </div>

              {isLoadingSenders ? (
                <div className="h-10 bg-slate-100 rounded-lg animate-pulse w-full"></div>
              ) : senders.length === 0 ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-800">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-amber-600" />
                    <span>No sender identity configured yet.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddSender(true)}
                    className="px-3 py-1 bg-amber-600 text-white rounded-md font-medium hover:bg-amber-700 cursor-pointer"
                  >
                    Configure Sender
                  </button>
                </div>
              ) : (
                <select
                  value={selectedSenderId}
                  onChange={(e) => setSelectedSenderId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                >
                  {senders.map((sender) => (
                    <option key={sender.id} value={sender.id}>
                      {sender.name} ({sender.email})
                    </option>
                  ))}
                </select>
              )}

              {/* Add Sender Inline Form Modal */}
              {showAddSender && (
                <div className="p-4 bg-indigo-50/50 border border-indigo-200 rounded-xl space-y-3 mt-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900">
                    Create Sender Identity
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Sender Name (e.g. Sales Team)"
                      value={newSenderName}
                      onChange={(e) => setNewSenderName(e.target.value)}
                      className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                    <input
                      type="email"
                      placeholder="Sender Email (e.g. sales@mailflow.local)"
                      value={newSenderEmail}
                      onChange={(e) => setNewSenderEmail(e.target.value)}
                      className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddSender(false)}
                      className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateSender}
                      disabled={isCreatingSender}
                      className="px-4 py-1.5 text-xs bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                    >
                      {isCreatingSender ? 'Saving...' : 'Save Sender'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Recipient CSV Upload & Preview */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <label className="block text-sm font-semibold text-slate-900">
                2. Upload Recipient CSV <span className="text-rose-500">*</span>
              </label>

              {!csvSummary ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/20 rounded-2xl p-8 text-center transition-all cursor-pointer group"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".csv"
                    className="hidden"
                  />
                  <div className="w-12 h-12 bg-white rounded-xl shadow-xs border border-slate-200 text-slate-500 group-hover:text-indigo-600 flex items-center justify-center mx-auto mb-3 transition-colors">
                    {isParsingCsv ? (
                      <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                    ) : (
                      <Upload className="w-6 h-6" />
                    )}
                  </div>
                  <p className="text-sm font-semibold text-slate-800 mb-1">
                    {isParsingCsv ? 'Parsing CSV File...' : 'Click to upload or drag & drop CSV'}
                  </p>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    CSV should include headers <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-700">email</code> or <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-700">name,email</code>
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* CSV Summary Cards */}
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-lg">
                        <FileSpreadsheet className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          CSV Parse Results
                        </p>
                        <p className="text-sm font-bold text-slate-900">
                          {csvSummary.validCount} Valid Recipients Found
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearCsv}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Remove CSV file"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Summary Breakdown Metrics */}
                  <div className="grid grid-cols-3 gap-3 text-center text-xs">
                    <div className="p-3 bg-emerald-50/60 border border-emerald-200/60 rounded-lg">
                      <p className="font-bold text-emerald-800 text-base">{csvSummary.validCount}</p>
                      <p className="text-emerald-600 font-medium">Valid Recipients</p>
                    </div>
                    <div className="p-3 bg-amber-50/60 border border-amber-200/60 rounded-lg">
                      <p className="font-bold text-amber-800 text-base">{csvSummary.invalidCount}</p>
                      <p className="text-amber-600 font-medium">Invalid Rows</p>
                    </div>
                    <div className="p-3 bg-blue-50/60 border border-blue-200/60 rounded-lg">
                      <p className="font-bold text-blue-800 text-base">{csvSummary.duplicatesRemoved}</p>
                      <p className="text-blue-600 font-medium">Duplicates Filtered</p>
                    </div>
                  </div>

                  {/* Recipient Preview Table */}
                  {csvSummary.validCount > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 text-xs font-semibold text-slate-600 flex items-center justify-between">
                        <span>Recipient Preview Table</span>
                        <span>
                          Showing {Math.min(csvSummary.validCount, (previewPage - 1) * PREVIEW_PER_PAGE + 1)}-
                          {Math.min(csvSummary.validCount, previewPage * PREVIEW_PER_PAGE)} of {csvSummary.validCount}
                        </span>
                      </div>
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100/50 text-slate-500 font-semibold border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-4">#</th>
                            <th className="py-2 px-4">Name</th>
                            <th className="py-2 px-4">Email Address</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {paginatedPreview().map((item, idx) => {
                            const globalIdx = (previewPage - 1) * PREVIEW_PER_PAGE + idx + 1;
                            return (
                              <tr key={globalIdx} className="hover:bg-slate-50">
                                <td className="py-2.5 px-4 text-slate-400 font-mono">{globalIdx}</td>
                                <td className="py-2.5 px-4 font-medium text-slate-800">
                                  {item.name || <span className="text-slate-400 italic">(None)</span>}
                                </td>
                                <td className="py-2.5 px-4 font-mono text-slate-700">{item.email}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      {/* Table Pagination Controls */}
                      {totalPages > 1 && (
                        <div className="bg-slate-50 px-4 py-2 border-t border-slate-200 flex items-center justify-between text-xs">
                          <button
                            type="button"
                            onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                            disabled={previewPage === 1}
                            className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 disabled:opacity-40 cursor-pointer"
                          >
                            <ChevronLeft className="w-4 h-4" /> Previous
                          </button>
                          <span className="text-slate-500">
                            Page {previewPage} of {totalPages}
                          </span>
                          <button
                            type="button"
                            onClick={() => setPreviewPage((p) => Math.min(totalPages, p + 1))}
                            disabled={previewPage === totalPages}
                            className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 disabled:opacity-40 cursor-pointer"
                          >
                            Next <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Step 3: Subject & Body */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <label className="block text-sm font-semibold text-slate-900">
                3. Compose Content <span className="text-rose-500">*</span>
              </label>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Subject Line
                </label>
                <input
                  type="text"
                  placeholder="e.g. Special Invitation to MailFlow Product Launch"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Email Body Content
                </label>
                <textarea
                  rows={6}
                  placeholder="Type your email message here..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-sans leading-relaxed"
                  required
                />
              </div>
            </div>

            {/* Step 4: Schedule Time & Rate Limiter Info */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <label className="block text-sm font-semibold text-slate-900">
                4. Schedule Delivery Time & Server Rate Limiter
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Scheduled Start Date & Time <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledAtStr}
                    onChange={(e) => setScheduledAtStr(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    required
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Timestamp converted to ISO-8601 for BullMQ delayed queue
                  </p>
                </div>

                {/* Server Rate Limiter Display Info */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                    <Clock className="w-4 h-4 text-indigo-600" />
                    <span>Server Distributed Rate Limiter</span>
                  </div>
                  <div className="flex justify-between text-slate-600 border-b border-slate-200/60 pb-1">
                    <span>Minimum Email Delay:</span>
                    <span className="font-semibold text-slate-900">2,000 ms</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Max Hourly Send Capacity:</span>
                    <span className="font-semibold text-slate-900">100 emails/hr</span>
                  </div>
                  <p className="text-[10px] text-slate-400 pt-0.5">
                    * Authoritative Redis rate limiter is enforced dynamically by backend workers.
                  </p>
                </div>
              </div>
            </div>

            {/* Submission Button */}
            <div className="flex items-center justify-end gap-4 pt-2">
              <Link
                to="/dashboard"
                className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={isSubmitting || !csvSummary || csvSummary.validCount === 0}
                className="inline-flex items-center gap-2 px-7 py-3 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Scheduling Campaign...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Schedule Campaign Delivery</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </Layout>
  );
};
