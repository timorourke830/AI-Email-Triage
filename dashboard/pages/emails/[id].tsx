import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { getEmail, approveEmail, rejectEmail } from '@/lib/api';
import EmailDetail from '@/components/EmailDetail';
import type { Email, Attachment, AuditLog } from '@/lib/types';

export default function EmailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [email, setEmail] = useState<Email | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEmail = async () => {
    if (!id || typeof id !== 'string') return;

    setLoading(true);
    setError(null);
    try {
      const result = await getEmail(id);
      setEmail(result.email);
      setAttachments(result.attachments);
      setAuditLogs(result.audit_logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch email');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchEmail();
    }
  }, [id]);

  const handleApprove = async (editedReply?: string) => {
    if (!id || typeof id !== 'string') return;

    try {
      await approveEmail(id, editedReply);
      await fetchEmail(); // Refresh data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve email');
    }
  };

  const handleReject = async (reason?: string) => {
    if (!id || typeof id !== 'string') return;

    try {
      await rejectEmail(id, reason);
      await fetchEmail(); // Refresh data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject email');
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading email...</div>
      </div>
    );
  }

  if (error || !email) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>
          {error || 'Email not found'}
          <Link href="/" style={styles.backLink}>
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{email.subject} - AI Email Triage</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={styles.container}>
        <header style={styles.header}>
          <Link href="/" style={styles.backLink}>
            &larr; Back to Dashboard
          </Link>
        </header>

        <main style={styles.main}>
          <EmailDetail
            email={email}
            attachments={attachments}
            auditLogs={auditLogs}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        </main>
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: 'white',
    borderBottom: '1px solid #e5e7eb',
    padding: '16px 32px',
  },
  backLink: {
    color: '#3b82f6',
    textDecoration: 'none',
    fontSize: '14px',
  },
  main: {
    padding: '24px 32px',
  },
  loading: {
    padding: '40px',
    textAlign: 'center',
    color: '#6b7280',
  },
  error: {
    padding: '40px',
    textAlign: 'center',
    color: '#dc2626',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
};
