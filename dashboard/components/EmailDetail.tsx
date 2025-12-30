import { useState } from 'react';
import type { Email, Attachment, AuditLog, EmailStatus } from '@/lib/types';

interface EmailDetailProps {
  email: Email;
  attachments: Attachment[];
  auditLogs: AuditLog[];
  onApprove: (editedReply?: string) => Promise<void>;
  onReject: (reason?: string) => Promise<void>;
}

const statusColors: Record<EmailStatus, string> = {
  pending: '#6b7280',
  processing: '#3b82f6',
  awaiting_approval: '#f59e0b',
  sent: '#10b981',
  rejected: '#ef4444',
};

const statusLabels: Record<EmailStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  awaiting_approval: 'Awaiting Approval',
  sent: 'Sent',
  rejected: 'Rejected',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

export default function EmailDetail({
  email,
  attachments,
  auditLogs,
  onApprove,
  onReject,
}: EmailDetailProps) {
  const [editedReply, setEditedReply] = useState(email.draft_reply || '');
  const [rejectReason, setRejectReason] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleApprove = async () => {
    setLoading(true);
    try {
      const edited = isEditing && editedReply !== email.draft_reply ? editedReply : undefined;
      await onApprove(edited);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      await onReject(rejectReason || undefined);
    } finally {
      setLoading(false);
    }
  };

  const canApprove = email.status === 'awaiting_approval';

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerInfo}>
          <h1 style={styles.subject}>{email.subject}</h1>
          <span
            style={{
              ...styles.status,
              backgroundColor: statusColors[email.status],
            }}
          >
            {statusLabels[email.status]}
          </span>
        </div>
        <div style={styles.meta}>
          <div><strong>From:</strong> {email.from_address}</div>
          <div><strong>To:</strong> {email.to_address}</div>
          <div><strong>Received:</strong> {formatDate(email.created_at)}</div>
          {email.classification && (
            <div>
              <strong>Classification:</strong> {email.classification}
              {email.classification_confidence && (
                <span style={styles.confidence}>
                  ({Math.round(email.classification_confidence * 100)}% confidence)
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Original Email */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Original Email</h2>
        <div style={styles.emailBody}>{email.body}</div>
      </div>

      {/* Attachments */}
      {attachments.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Attachments ({attachments.length})</h2>
          <ul style={styles.attachmentList}>
            {attachments.map((att) => (
              <li key={att.id} style={styles.attachmentItem}>
                {att.filename} <span style={styles.attachmentType}>({att.content_type})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Extracted Data */}
      {email.extracted_data && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Extracted Information</h2>
          <pre style={styles.jsonBlock}>
            {JSON.stringify(email.extracted_data, null, 2)}
          </pre>
        </div>
      )}

      {/* Draft Reply */}
      {email.draft_reply && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>
            Draft Reply
            {canApprove && !isEditing && (
              <button
                style={styles.editButton}
                onClick={() => setIsEditing(true)}
              >
                Edit
              </button>
            )}
          </h2>
          {isEditing ? (
            <div>
              <textarea
                style={styles.textarea}
                value={editedReply}
                onChange={(e) => setEditedReply(e.target.value)}
                rows={12}
              />
              <div style={styles.editActions}>
                <button
                  style={styles.cancelButton}
                  onClick={() => {
                    setIsEditing(false);
                    setEditedReply(email.draft_reply || '');
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={styles.emailBody}>{email.draft_reply}</div>
          )}
        </div>
      )}

      {/* Final Reply (if sent) */}
      {email.final_reply && email.status === 'sent' && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Sent Reply</h2>
          <div style={styles.emailBody}>{email.final_reply}</div>
          {email.sent_at && (
            <div style={styles.sentAt}>Sent at: {formatDate(email.sent_at)}</div>
          )}
        </div>
      )}

      {/* Actions */}
      {canApprove && (
        <div style={styles.actions}>
          <div style={styles.rejectSection}>
            <input
              type="text"
              placeholder="Rejection reason (optional)"
              style={styles.rejectInput}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <button
              style={styles.rejectButton}
              onClick={handleReject}
              disabled={loading}
            >
              {loading ? 'Processing...' : 'Reject'}
            </button>
          </div>
          <button
            style={styles.approveButton}
            onClick={handleApprove}
            disabled={loading}
          >
            {loading ? 'Processing...' : isEditing ? 'Approve with Edits' : 'Approve & Send'}
          </button>
        </div>
      )}

      {/* Audit Log */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Activity Log</h2>
        <div style={styles.timeline}>
          {auditLogs.map((log) => (
            <div key={log.id} style={styles.timelineItem}>
              <div style={styles.timelineTime}>{formatDate(log.created_at)}</div>
              <div style={styles.timelineAction}>
                <strong>{log.action}</strong> by {log.actor}
                {log.details && (
                  <div style={styles.timelineDetails}>
                    {JSON.stringify(log.details)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '900px',
    margin: '0 auto',
  },
  header: {
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: '1px solid #e5e7eb',
  },
  headerInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
  },
  subject: {
    fontSize: '24px',
    fontWeight: 600,
    margin: 0,
    color: '#111827',
  },
  status: {
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: '4px',
    color: 'white',
    fontSize: '12px',
    fontWeight: 500,
  },
  meta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    fontSize: '14px',
    color: '#4b5563',
  },
  confidence: {
    marginLeft: '4px',
    color: '#9ca3af',
  },
  section: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 600,
    marginBottom: '12px',
    color: '#374151',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  emailBody: {
    backgroundColor: '#f9fafb',
    padding: '16px',
    borderRadius: '8px',
    whiteSpace: 'pre-wrap',
    fontSize: '14px',
    lineHeight: 1.6,
    color: '#374151',
  },
  attachmentList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  attachmentItem: {
    padding: '8px 12px',
    backgroundColor: '#f3f4f6',
    borderRadius: '4px',
    marginBottom: '4px',
    fontSize: '14px',
  },
  attachmentType: {
    color: '#9ca3af',
    fontSize: '12px',
  },
  jsonBlock: {
    backgroundColor: '#1f2937',
    color: '#e5e7eb',
    padding: '16px',
    borderRadius: '8px',
    overflow: 'auto',
    fontSize: '12px',
  },
  textarea: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  editButton: {
    padding: '4px 12px',
    fontSize: '12px',
    backgroundColor: '#e5e7eb',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  editActions: {
    marginTop: '8px',
  },
  cancelButton: {
    padding: '6px 12px',
    fontSize: '13px',
    backgroundColor: '#e5e7eb',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  actions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    marginBottom: '24px',
  },
  rejectSection: {
    display: 'flex',
    gap: '8px',
  },
  rejectInput: {
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    width: '200px',
  },
  rejectButton: {
    padding: '8px 16px',
    fontSize: '14px',
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  approveButton: {
    padding: '10px 24px',
    fontSize: '14px',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 500,
  },
  sentAt: {
    marginTop: '8px',
    fontSize: '12px',
    color: '#6b7280',
  },
  timeline: {
    borderLeft: '2px solid #e5e7eb',
    paddingLeft: '16px',
  },
  timelineItem: {
    marginBottom: '16px',
    position: 'relative',
  },
  timelineTime: {
    fontSize: '12px',
    color: '#9ca3af',
    marginBottom: '4px',
  },
  timelineAction: {
    fontSize: '14px',
    color: '#374151',
  },
  timelineDetails: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '4px',
  },
};
