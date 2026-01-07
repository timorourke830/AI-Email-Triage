import Link from 'next/link';
import { Eye, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusBadge, ClassificationBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Email, EmailStatus } from '@/lib/types';

interface EmailListProps {
  emails: Email[];
  loading?: boolean;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len) + '...';
}

// Skeleton row for loading state
function SkeletonRow() {
  return (
    <tr className="border-b border-slate-100 dark:border-slate-800">
      <td className="px-4 py-3">
        <div className="h-5 w-24 skeleton rounded" />
      </td>
      <td className="px-4 py-3">
        <div className="h-5 w-32 skeleton rounded" />
      </td>
      <td className="px-4 py-3">
        <div className="h-5 w-48 skeleton rounded" />
      </td>
      <td className="px-4 py-3">
        <div className="h-5 w-20 skeleton rounded" />
      </td>
      <td className="px-4 py-3">
        <div className="h-5 w-16 skeleton rounded" />
      </td>
      <td className="px-4 py-3">
        <div className="h-8 w-16 skeleton rounded" />
      </td>
    </tr>
  );
}

export default function EmailList({ emails, loading }: EmailListProps) {
  if (loading) {
    return (
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 dark:bg-slate-800/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                From
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Subject
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Classification
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((i) => (
              <SkeletonRow key={i} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">
          No emails found
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Try adjusting your filters or refresh to check for new emails.
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                From
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Subject
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Classification
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {emails.map((email) => (
              <tr
                key={email.id}
                className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  <StatusBadge status={email.status} />
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    {truncate(email.from_address, 30)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm font-medium text-slate-900 dark:text-white">
                    {truncate(email.subject, 40)}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {email.classification ? (
                    <ClassificationBadge
                      classification={email.classification}
                      confidence={email.classification_confidence ?? undefined}
                    />
                  ) : (
                    <span className="text-sm text-slate-400">-</span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {formatDate(email.created_at)}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <Link href={`/emails/${email.id}`}>
                    <Button variant="ghost" size="sm" className="gap-1.5">
                      <Eye className="w-4 h-4" />
                      View
                    </Button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
