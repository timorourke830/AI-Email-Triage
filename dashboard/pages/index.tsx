import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { getEmails } from '@/lib/api';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import EmailList from '@/components/EmailList';
import type { Email, EmailStatus, PaginationInfo } from '@/lib/types';

interface FetchResult {
  success: boolean;
  fetched: number;
  stored: number;
  error?: string;
}

interface ProcessResult {
  success: boolean;
  processed: number;
  errors: number;
}

const STATUS_OPTIONS: Array<{ value: EmailStatus | ''; label: string }> = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'awaiting_approval', label: 'Awaiting Approval' },
  { value: 'sent', label: 'Sent' },
  { value: 'rejected', label: 'Rejected' },
];

export default function Home() {
  const router = useRouter();
  const [emails, setEmails] = useState<Email[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<EmailStatus | ''>('');
  const [page, setPage] = useState(1);

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/auth/signin');
  };

  const loadEmails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getEmails({
        status: statusFilter || undefined,
        page,
        limit: 20,
      });
      setEmails(result.emails);
      setPagination(result.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch emails');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  // Fetch new emails from email provider, then process pending ones
  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshStatus('Fetching new emails...');
    setError(null);

    try {
      // Step 1: Fetch new emails from provider
      const fetchRes = await fetch('/api/emails/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sinceDays: 7, unreadOnly: true }),
      });

      const fetchResult: FetchResult = await fetchRes.json();

      if (!fetchRes.ok) {
        throw new Error(fetchResult.error || 'Failed to fetch emails');
      }

      const fetchMsg = fetchResult.stored > 0
        ? `Fetched ${fetchResult.stored} new email${fetchResult.stored !== 1 ? 's' : ''}`
        : 'No new emails';

      // Step 2: Process any pending emails
      setRefreshStatus('Processing pending emails...');

      const processRes = await fetch('/api/emails/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 10 }),
      });

      const processResult: ProcessResult = await processRes.json();

      let processMsg = '';
      if (processResult.processed > 0) {
        processMsg = `, processed ${processResult.processed}`;
      }

      setRefreshStatus(`${fetchMsg}${processMsg}`);

      // Reload email list
      await loadEmails();

      // Clear status after a delay
      setTimeout(() => setRefreshStatus(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
      setRefreshStatus(null);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadEmails();
  }, [loadEmails]);

  return (
    <>
      <Head>
        <title>AI Email Triage - Dashboard</title>
        <meta name="description" content="AI-powered email triage system" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Email Triage Dashboard</h1>
            <p style={styles.subtitle}>AI-powered email classification and response drafting</p>
          </div>
          <div style={styles.headerActions}>
            <Link href="/settings" style={styles.settingsLink}>
              Settings
            </Link>
            <button
              type="button"
              style={styles.signOutButton}
              onClick={handleSignOut}
            >
              Sign Out
            </button>
          </div>
        </header>

        <main style={styles.main}>
          {/* Filters */}
          <div style={styles.filters}>
            <select
              style={styles.select}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as EmailStatus | '');
                setPage(1);
              }}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              style={{
                ...styles.refreshButton,
                ...(refreshing ? styles.refreshButtonDisabled : {}),
              }}
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing...' : 'Refresh Emails'}
            </button>
            {refreshStatus && (
              <span style={styles.refreshStatus}>{refreshStatus}</span>
            )}
          </div>

          {/* Error */}
          {error && (
            <div style={styles.error}>
              {error}
            </div>
          )}

          {/* Email List */}
          <EmailList emails={emails} loading={loading} />

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div style={styles.pagination}>
              <button
                style={styles.pageButton}
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span style={styles.pageInfo}>
                Page {pagination.page} of {pagination.pages} ({pagination.total} emails)
              </span>
              <button
                style={styles.pageButton}
                disabled={page === pagination.pages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          )}
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
    padding: '24px 32px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerActions: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  settingsLink: {
    color: '#3b82f6',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 500,
    padding: '8px 16px',
    border: '1px solid #3b82f6',
    borderRadius: '6px',
    transition: 'background-color 0.2s',
  },
  signOutButton: {
    color: '#6b7280',
    fontSize: '14px',
    fontWeight: 500,
    padding: '8px 16px',
    backgroundColor: 'white',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    margin: 0,
    color: '#111827',
  },
  subtitle: {
    fontSize: '14px',
    color: '#6b7280',
    margin: '4px 0 0 0',
  },
  main: {
    padding: '24px 32px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  filters: {
    display: 'flex',
    gap: '12px',
    marginBottom: '24px',
  },
  select: {
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: 'white',
    cursor: 'pointer',
  },
  refreshButton: {
    padding: '8px 16px',
    fontSize: '14px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  refreshButtonDisabled: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed',
  },
  refreshStatus: {
    fontSize: '14px',
    color: '#059669',
    fontWeight: 500,
  },
  error: {
    padding: '12px 16px',
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    borderRadius: '6px',
    marginBottom: '16px',
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '16px',
    marginTop: '24px',
    padding: '16px',
  },
  pageButton: {
    padding: '8px 16px',
    fontSize: '14px',
    backgroundColor: 'white',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  pageInfo: {
    fontSize: '14px',
    color: '#6b7280',
  },
};
