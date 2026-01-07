import { useState } from 'react';
import {
  Check,
  X,
  Edit3,
  Clock,
  Paperclip,
  Sparkles,
  Send,
  History,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { StatusBadge, ClassificationBadge } from '@/components/ui/Badge';
import { Input, Textarea } from '@/components/ui/Input';
import type { Email, Attachment, AuditLog, EmailStatus } from '@/lib/types';

interface EmailDetailProps {
  email: Email;
  attachments: Attachment[];
  auditLogs: AuditLog[];
  onApprove: (editedReply?: string) => Promise<void>;
  onReject: (reason?: string) => Promise<void>;
  onProcess?: () => Promise<void>;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function EmailDetail({
  email,
  attachments,
  auditLogs,
  onApprove,
  onReject,
  onProcess,
}: EmailDetailProps) {
  const [editedReply, setEditedReply] = useState(email.draft_reply || '');
  const [rejectReason, setRejectReason] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [hasSavedEdits, setHasSavedEdits] = useState(false);

  const handleApprove = async () => {
    setLoading(true);
    try {
      const hasChanges = editedReply !== email.draft_reply;
      const edited = (hasSavedEdits || isEditing) && hasChanges ? editedReply : undefined;
      await onApprove(edited);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdits = () => {
    setHasSavedEdits(true);
    setIsEditing(false);
  };

  const handleCancelEdits = () => {
    setEditedReply(email.draft_reply || '');
    setIsEditing(false);
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      await onReject(rejectReason || undefined);
    } finally {
      setLoading(false);
    }
  };

  const handleProcess = async () => {
    if (!onProcess) return;
    setProcessing(true);
    try {
      await onProcess();
    } finally {
      setProcessing(false);
    }
  };

  const canApprove = email.status === 'awaiting_approval';
  const canProcess = email.status === 'pending' && !!onProcess;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Card */}
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-3">
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white truncate">
                {email.subject}
              </h1>
              <StatusBadge status={email.status} />
            </div>

            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <span className="font-medium text-slate-900 dark:text-slate-200">From:</span>
                {email.from_address}
              </div>
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <span className="font-medium text-slate-900 dark:text-slate-200">To:</span>
                {email.to_address}
              </div>
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <Clock className="w-4 h-4" />
                {formatDate(email.created_at)}
              </div>
            </div>
          </div>

          {email.classification && (
            <div className="text-right">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">Classification</p>
              <ClassificationBadge
                classification={email.classification}
                confidence={email.classification_confidence ?? undefined}
              />
            </div>
          )}
        </div>
      </Card>

      {/* Process Button for Pending Emails */}
      {canProcess && (
        <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="font-medium text-amber-800 dark:text-amber-300">
                  Ready for AI Processing
                </h3>
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Click to classify this email and generate a draft reply
                </p>
              </div>
            </div>
            <Button
              onClick={handleProcess}
              isLoading={processing}
              className="shrink-0"
            >
              <Sparkles className="w-4 h-4" />
              Process with AI
            </Button>
          </div>
        </div>
      )}

      {/* Original Email */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="w-4 h-4" />
            Original Email
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            {email.body}
          </div>
        </CardContent>
      </Card>

      {/* Attachments */}
      {attachments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Paperclip className="w-4 h-4" />
              Attachments ({attachments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50"
                >
                  <div className="p-2 rounded bg-slate-200 dark:bg-slate-700">
                    <Paperclip className="w-4 h-4 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {att.filename}
                    </p>
                    <p className="text-xs text-slate-500">{att.content_type}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Draft Reply */}
      {email.draft_reply && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Edit3 className="w-4 h-4" />
                Draft Reply
                {hasSavedEdits && !isEditing && (
                  <span className="ml-2 px-2 py-0.5 text-xs font-medium rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                    Edited
                  </span>
                )}
              </CardTitle>
              {canApprove && !isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  <Edit3 className="w-4 h-4" />
                  Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <div className="space-y-3">
                <Textarea
                  value={editedReply}
                  onChange={(e) => setEditedReply(e.target.value)}
                  className="min-h-[200px]"
                />
                <div className="flex gap-2">
                  <Button onClick={handleSaveEdits}>
                    Save Changes
                  </Button>
                  <Button variant="secondary" onClick={handleCancelEdits}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {hasSavedEdits ? editedReply : email.draft_reply}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sent Reply */}
      {email.final_reply && email.status === 'sent' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-emerald-700 dark:text-emerald-400">
              <Send className="w-4 h-4" />
              Sent Reply
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {email.final_reply}
            </div>
            {email.sent_at && (
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                Sent at: {formatDate(email.sent_at)}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      {canApprove && (
        <Card className="bg-slate-50 dark:bg-slate-800/50">
          <div className="space-y-4">
            {/* Rejection reason input */}
            <Input
              type="text"
              placeholder="Rejection reason (optional)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />

            {/* Action buttons row: Reject | Edit | Approve & Send */}
            <div className="flex items-center gap-3">
              <Button
                variant="danger"
                onClick={handleReject}
                isLoading={loading}
              >
                <X className="w-4 h-4" />
                Reject
              </Button>

              <Button
                variant="secondary"
                onClick={() => setIsEditing(true)}
                disabled={isEditing}
              >
                <Edit3 className="w-4 h-4" />
                Edit Draft
              </Button>

              <Button
                variant="success"
                onClick={handleApprove}
                isLoading={loading}
                className="ml-auto"
              >
                <Check className="w-4 h-4" />
                {hasSavedEdits ? 'Send Edited Reply' : 'Approve & Send'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Activity Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="w-4 h-4" />
            Activity Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          {auditLogs.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No activity recorded yet.
            </p>
          ) : (
            <div className="relative border-l-2 border-slate-200 dark:border-slate-700 pl-4 space-y-4">
              {auditLogs.map((log) => (
                <div key={log.id} className="relative">
                  <div className="absolute -left-[21px] w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {formatDate(log.created_at)}
                  </p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    <span className="font-medium">{log.action}</span> by {log.actor}
                  </p>
                  {log.details && (
                    <pre className="mt-1 text-xs text-slate-500 dark:text-slate-400 overflow-auto">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
