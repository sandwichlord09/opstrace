'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ImageIcon,
  Lock,
  MessageSquare,
  UserPlus,
} from 'lucide-react';
import {
  DownloadAttachmentUrlDto,
  ExceptionDto,
  ExceptionStatus,
  ResolutionType,
} from '@opstrace/shared-types';
import {
  AddExceptionCommentSchema,
  ResolveExceptionSchema,
} from '@opstrace/validation';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/AuthContext';

export default function ExceptionDetailPage() {
  const params = useParams<{ id: string }>();
  const exceptionId = params.id;
  const { user, hasPermission } = useAuth();

  const [exception, setException] = useState<ExceptionDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [assigneeId, setAssigneeId] = useState('');
  const [commentText, setCommentText] = useState('');
  const [resolutionStatus, setResolutionStatus] = useState<
    ExceptionStatus.RESOLVED | ExceptionStatus.DISMISSED
  >(ExceptionStatus.RESOLVED);
  const [resolutionType, setResolutionType] = useState<ResolutionType>(
    ResolutionType.SUPPLIER_SHORT_SHIPMENT_ACCEPTED,
  );
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Presigned photo URL lookup
  const [attachmentIdInput, setAttachmentIdInput] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const loadException = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<ExceptionDto>(`/exceptions/${exceptionId}`);
      setException(data);
      if (!assigneeId && user?.userId) {
        setAssigneeId(user.userId);
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to load exception.',
      );
    } finally {
      setLoading(false);
    }
  }, [exceptionId, assigneeId, user?.userId]);

  useEffect(() => {
    void loadException();
  }, [loadException]);

  const isTerminal =
    exception?.status === ExceptionStatus.RESOLVED ||
    exception?.status === ExceptionStatus.DISMISSED ||
    exception?.status === ExceptionStatus.CLOSED;

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigneeId.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post(`/exceptions/${exceptionId}/assign`, {
        assignedToUserId: assigneeId.trim(),
      });
      await loadException();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Assignment failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = AddExceptionCommentSchema.safeParse({ content: commentText });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid comment.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post(`/exceptions/${exceptionId}/comments`, parsed.data);
      setCommentText('');
      await loadException();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add comment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = ResolveExceptionSchema.safeParse({
      status: resolutionStatus,
      resolutionType,
      resolutionNotes,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid resolution details.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post(`/exceptions/${exceptionId}/resolve`, parsed.data);
      await loadException();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Resolution failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoadEvidenceUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attachmentIdInput.trim()) return;
    setError(null);
    try {
      const res = await apiClient.get<DownloadAttachmentUrlDto>(
        `/attachments/${attachmentIdInput.trim()}/download-url`,
      );
      setPreviewUrl(res.downloadUrl);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Unable to fetch evidence URL.',
      );
    }
  };

  if (loading) {
    return <div className="text-sm text-slate-500">Loading investigation workspace...</div>;
  }

  if (!exception) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error || 'Exception not found.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/exceptions"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Exceptions
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {exception.exceptionNumber}: {exception.title}
          </h1>
          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
            {exception.severity}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-800">
            {exception.status}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-700">
          {exception.description || 'No description provided.'}
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left 2 cols: Related Record, Evidence, Comments */}
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">
              Discrepancy Context ({exception.relatedRecordType})
            </h2>
            <p className="mt-1 font-mono text-xs text-slate-500">
              Related Record ID: {exception.relatedRecordId}
            </p>
            {exception.relatedRecord && (
              <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                {JSON.stringify(exception.relatedRecord, null, 2)}
              </pre>
            )}
          </div>

          {/* Evidence Photo Gallery */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-900">
                Presigned Evidence Viewer
              </h2>
            </div>
            <form onSubmit={handleLoadEvidenceUrl} className="mt-3 flex gap-2">
              <input
                type="text"
                value={attachmentIdInput}
                onChange={(e) => setAttachmentIdInput(e.target.value)}
                placeholder="Paste Attachment UUID to fetch presigned photo..."
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900"
              />
              <button
                type="submit"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Load Photo
              </button>
            </form>
            {previewUrl && (
              <div className="mt-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Evidence attachment"
                  className="max-h-64 rounded-lg border border-slate-200 object-contain"
                />
              </div>
            )}
          </div>

          {/* Investigation Comment Thread */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-900">
                Investigation Notes ({exception.comments?.length ?? 0})
              </h2>
            </div>

            <div className="mt-4 space-y-3">
              {(exception.comments ?? []).length === 0 ? (
                <p className="text-xs text-slate-500">No investigation notes yet.</p>
              ) : (
                (exception.comments ?? []).map((c) => (
                  <div
                    key={c.id}
                    className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-semibold text-slate-800">
                        {c.user
                          ? `${c.user.firstName} ${c.user.lastName}`
                          : c.userId}
                      </span>
                      <span>{new Date(c.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 text-slate-700">{c.content}</p>
                  </div>
                ))
              )}
            </div>

            {!isTerminal && hasPermission('exception:comment') && (
              <form onSubmit={handleAddComment} className="mt-4 space-y-2">
                <textarea
                  rows={2}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add investigation findings..."
                  className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  Post Note
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Right col: Assignment & Resolution */}
        <div className="space-y-6">
          {/* Assignment */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-900">
                Investigator Assignment
              </h2>
            </div>

            <div className="mt-3 space-y-1 text-xs text-slate-600">
              {(exception.assignments ?? []).length === 0 ? (
                <p>Unassigned</p>
              ) : (
                (exception.assignments ?? []).map((a) => (
                  <div key={a.id}>
                    Assigned to:{' '}
                    <span className="font-semibold text-slate-900">
                      {a.assignee
                        ? `${a.assignee.firstName} ${a.assignee.lastName}`
                        : a.assignedTo}
                    </span>
                  </div>
                ))
              )}
            </div>

            {!isTerminal && hasPermission('exception:assign') && (
              <form onSubmit={handleAssign} className="mt-4 space-y-2">
                <input
                  type="text"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  placeholder="Org Member User UUID"
                  className="block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Assign Investigator
                </button>
              </form>
            )}
          </div>

          {/* Resolution Panel */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              {isTerminal ? (
                <Lock className="h-4 w-4 text-emerald-600" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-slate-500" />
              )}
              <h2 className="text-sm font-semibold text-slate-900">
                Resolution Decision
              </h2>
            </div>

            {isTerminal && exception.resolution ? (
              <div className="mt-3 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                <div className="font-semibold">
                  {exception.resolution.resolutionType}
                </div>
                <p>{exception.resolution.resolutionNotes}</p>
                <div className="text-[11px] text-emerald-700">
                  Resolved at{' '}
                  {new Date(exception.resolution.resolvedAt).toLocaleString()}
                </div>
              </div>
            ) : isTerminal ? (
              <p className="mt-3 text-xs text-slate-500">
                This exception is locked in terminal status ({exception.status}).
              </p>
            ) : hasPermission('exception:resolve') ? (
              <form onSubmit={handleResolve} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Outcome Status
                  </label>
                  <select
                    value={resolutionStatus}
                    onChange={(e) =>
                      setResolutionStatus(
                        e.target.value as
                          | ExceptionStatus.RESOLVED
                          | ExceptionStatus.DISMISSED,
                      )
                    }
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                  >
                    <option value={ExceptionStatus.RESOLVED}>RESOLVED</option>
                    <option value={ExceptionStatus.DISMISSED}>DISMISSED</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Resolution Type
                  </label>
                  <select
                    value={resolutionType}
                    onChange={(e) =>
                      setResolutionType(e.target.value as ResolutionType)
                    }
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                  >
                    {Object.values(ResolutionType).map((rt) => (
                      <option key={rt} value={rt}>
                        {rt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Resolution Notes
                  </label>
                  <textarea
                    rows={3}
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Document root cause and financial/inventory disposition..."
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {submitting ? 'Finalizing...' : 'Finalize & Close Exception'}
                </button>
              </form>
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                You do not have permission to resolve exceptions.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
