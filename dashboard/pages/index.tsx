import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { Inbox, Clock, CheckCircle, AlertTriangle, Mail } from 'lucide-react';
import { getEmails } from '@/lib/api';
import { Layout } from '@/components/layout/Layout';
import { Header } from '@/components/layout/Header';
import { Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { StatsCard, StatsCardSkeleton } from '@/components/dashboard/StatsCard';
import { ClassificationChart, ClassificationChartSkeleton } from '@/components/dashboard/ClassificationChart';
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

interface DashboardStats {
  total: number;
  byStatus: {
    pending: number;
    processing: number;
    awaiting_approval: number;
    sent: number;
    rejected: number;
  };
  byClassification: {
    inquiry: number;
    complaint: number;
    support: number;
    billing: number;
    spam: number;
    other: number;
    unclassified: number;
  };
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'awaiting_approval', label: 'Awaiting Approval' },
  { value: 'sent', label: 'Sent' },
  { value: 'rejected', label: 'Rejected' },
];

export default function Home() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<EmailStatus | ''>('');
  const [page, setPage] = useState(1);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/stats');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.stats) {
          setStats(data.stats);
        }
      }
    } catch {
      // Stats are non-critical, fail silently
    } finally {
      setStatsLoading(false);
    }
  }, []);

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
        body: JSON.stringify({ sinceDays: 7, unreadOnly: false }),
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

      // Reload email list and stats
      await Promise.all([loadEmails(), loadStats()]);

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
    loadStats();
  }, [loadEmails, loadStats]);

  // Fetch connected email address from settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          if (data.settings?.email_address) {
            setConnectedEmail(data.settings.email_address);
          }
        }
      } catch (err) {
        console.error('Failed to fetch settings:', err);
      }
    };
    fetchSettings();
  }, []);

  return (
    <>
      <Head>
        <title>Dashboard - AI Email Triage</title>
        <meta name="description" content="AI-powered email triage system" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <Layout>
        <Header
          title="Email Dashboard"
          subtitle={connectedEmail ? `Managing emails for ${connectedEmail}` : 'AI-powered email classification and response drafting'}
          onRefresh={handleRefresh}
          isRefreshing={refreshing}
          refreshStatus={refreshStatus}
        />

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-medium">{error}</span>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {statsLoading ? (
            <>
              <StatsCardSkeleton />
              <StatsCardSkeleton />
              <StatsCardSkeleton />
              <StatsCardSkeleton />
            </>
          ) : stats ? (
            <>
              <StatsCard
                title="Total Emails"
                value={stats.total}
                icon={Mail}
                color="default"
              />
              <StatsCard
                title="Pending"
                value={stats.byStatus.pending}
                hint="Needs AI processing"
                icon={Clock}
                color="amber"
                onClick={() => {
                  setStatusFilter('pending');
                  setPage(1);
                }}
                isActive={statusFilter === 'pending'}
              />
              <StatsCard
                title="Awaiting Approval"
                value={stats.byStatus.awaiting_approval}
                hint="Needs your review"
                icon={Inbox}
                color="purple"
                onClick={() => {
                  setStatusFilter('awaiting_approval');
                  setPage(1);
                }}
                isActive={statusFilter === 'awaiting_approval'}
              />
              <StatsCard
                title="Sent"
                value={stats.byStatus.sent}
                icon={CheckCircle}
                color="green"
              />
            </>
          ) : null}
        </div>

        {/* Classification Chart */}
        {statsLoading ? (
          <div className="mb-6">
            <ClassificationChartSkeleton />
          </div>
        ) : stats ? (
          <div className="mb-6">
            <ClassificationChart data={stats.byClassification} />
          </div>
        ) : null}

        {/* Filters */}
        <div className="mb-4 flex items-center gap-4">
          <div className="w-48">
            <Select
              options={STATUS_OPTIONS}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as EmailStatus | '');
                setPage(1);
              }}
            />
          </div>
          {statusFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatusFilter('');
                setPage(1);
              }}
            >
              Clear filter
            </Button>
          )}
        </div>

        {/* Email List */}
        <EmailList emails={emails} loading={loading} />

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Showing {((pagination.page - 1) * 20) + 1} to {Math.min(pagination.page * 20, pagination.total)} of {pagination.total} emails
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-slate-600 dark:text-slate-400 px-2">
                Page {pagination.page} of {pagination.pages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page === pagination.pages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Layout>
    </>
  );
}
