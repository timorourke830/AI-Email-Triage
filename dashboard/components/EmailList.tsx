import Link from 'next/link';
import type { Email, EmailStatus } from '@/lib/types';

interface EmailListProps {
  emails: Email[];
  loading?: boolean;
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
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len) + '...';
}

export default function EmailList({ emails, loading }: EmailListProps) {
  if (loading) {
    return (
      <div style={styles.loading}>
        Loading emails...
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div style={styles.empty}>
        No emails found
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Status</th>
            <th style={styles.th}>From</th>
            <th style={styles.th}>Subject</th>
            <th style={styles.th}>Classification</th>
            <th style={styles.th}>Date</th>
            <th style={styles.th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {emails.map((email) => (
            <tr key={email.id} style={styles.tr}>
              <td style={styles.td}>
                <span
                  style={{
                    ...styles.status,
                    backgroundColor: statusColors[email.status],
                  }}
                >
                  {statusLabels[email.status]}
                </span>
              </td>
              <td style={styles.td}>{truncate(email.from_address, 30)}</td>
              <td style={styles.td}>{truncate(email.subject, 40)}</td>
              <td style={styles.td}>
                {email.classification ? (
                  <span style={styles.classification}>
                    {email.classification}
                    {email.classification_confidence && (
                      <span style={styles.confidence}>
                        {Math.round(email.classification_confidence * 100)}%
                      </span>
                    )}
                  </span>
                ) : (
                  <span style={styles.notClassified}>-</span>
                )}
              </td>
              <td style={styles.td}>{formatDate(email.created_at)}</td>
              <td style={styles.td}>
                <Link href={`/emails/${email.id}`} style={styles.link}>
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
  },
  th: {
    textAlign: 'left',
    padding: '12px 16px',
    borderBottom: '2px solid #e5e7eb',
    fontWeight: 600,
    color: '#374151',
  },
  tr: {
    borderBottom: '1px solid #e5e7eb',
  },
  td: {
    padding: '12px 16px',
    color: '#4b5563',
  },
  status: {
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: '4px',
    color: 'white',
    fontSize: '12px',
    fontWeight: 500,
  },
  classification: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    textTransform: 'capitalize',
  },
  confidence: {
    fontSize: '11px',
    color: '#9ca3af',
  },
  notClassified: {
    color: '#9ca3af',
  },
  link: {
    color: '#3b82f6',
    textDecoration: 'none',
  },
  loading: {
    padding: '40px',
    textAlign: 'center',
    color: '#6b7280',
  },
  empty: {
    padding: '40px',
    textAlign: 'center',
    color: '#6b7280',
  },
};
