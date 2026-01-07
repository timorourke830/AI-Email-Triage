import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { ArrowLeft, Check } from 'lucide-react';
import { getEmail, approveEmail, rejectEmail, processEmails } from '@/lib/api';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import EmailDetail from '@/components/EmailDetail';
import type { Email, Attachment, AuditLog } from '@/lib/types';

// Toast notification component
function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div className={`
      fixed top-6 left-1/2 -translate-x-1/2 z-50
      flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg
      animate-slide-in-up
      ${type === 'success'
        ? 'bg-emerald-600 text-white'
        : 'bg-red-600 text-white'
      }
    `}>
      {type === 'success' && <Check className="w-4 h-4" />}
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}

// Loading skeleton
function EmailDetailSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="card p-6">
        <div className="h-6 w-2/3 skeleton rounded mb-4" />
        <div className="space-y-2">
          <div className="h-4 w-1/2 skeleton rounded" />
          <div className="h-4 w-1/3 skeleton rounded" />
          <div className="h-4 w-1/4 skeleton rounded" />
        </div>
      </div>

      {/* Body */}
      <div className="card p-6">
        <div className="h-5 w-32 skeleton rounded mb-4" />
        <div className="space-y-2">
          <div className="h-4 w-full skeleton rounded" />
          <div className="h-4 w-full skeleton rounded" />
          <div className="h-4 w-3/4 skeleton rounded" />
          <div className="h-4 w-full skeleton rounded" />
          <div className="h-4 w-1/2 skeleton rounded" />
        </div>
      </div>
    </div>
  );
}

export default function EmailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [email, setEmail] = useState<Email | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

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
      showToast('Email sent successfully!');
      // Redirect to dashboard after a brief delay
      setTimeout(() => {
        router.push('/');
      }, 1500);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to approve email', 'error');
    }
  };

  const handleReject = async (reason?: string) => {
    if (!id || typeof id !== 'string') return;

    try {
      await rejectEmail(id, reason);
      showToast('Email rejected');
      await fetchEmail(); // Refresh data
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to reject email', 'error');
    }
  };

  const handleProcess = async () => {
    if (!id || typeof id !== 'string') {
      showToast('Unable to process this email. Please refresh and try again.', 'error');
      return;
    }

    try {
      const result = await processEmails({ emailId: id });

      if (result.processed === 0) {
        const errorDetail = result.details?.find((d: { error?: string }) => d.error);
        if (errorDetail?.error?.includes('expected \'pending\'')) {
          showToast('This email has already been processed.', 'error');
        } else {
          showToast('Unable to process this email. It may have already been processed.', 'error');
        }
        return;
      }

      if (result.errors > 0) {
        const errorDetail = result.details?.find((d: { error?: string }) => d.error);
        showToast(errorDetail?.error || 'An error occurred while processing. Please try again.', 'error');
        return;
      }

      await fetchEmail(); // Refresh to see results
      const classification = result.details?.[0]?.classification;
      showToast(classification ? `Classified as: ${classification}` : 'Email processed successfully');
    } catch (err) {
      console.error('Failed to process email:', err);
      showToast('An error occurred while processing. Please try again.', 'error');
    }
  };

  return (
    <>
      <Head>
        <title>{email?.subject || 'Email'} - AI Email Triage</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <Layout>
        {/* Toast */}
        {toast && <Toast message={toast.message} type={toast.type} />}

        {/* Back button */}
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        {/* Content */}
        {loading ? (
          <EmailDetailSkeleton />
        ) : error || !email ? (
          <div className="max-w-4xl mx-auto">
            <div className="card p-12 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                {error || 'Email not found'}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                The email you&apos;re looking for might have been deleted or doesn&apos;t exist.
              </p>
              <Link href="/">
                <Button>Return to Dashboard</Button>
              </Link>
            </div>
          </div>
        ) : (
          <EmailDetail
            email={email}
            attachments={attachments}
            auditLogs={auditLogs}
            onApprove={handleApprove}
            onReject={handleReject}
            onProcess={handleProcess}
          />
        )}
      </Layout>
    </>
  );
}
