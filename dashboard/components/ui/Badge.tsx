import { type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import type { EmailStatus } from '@/lib/types';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
        primary: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400',
        success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
        warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        danger: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
        // Status-specific badges
        pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        processing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
        awaiting_approval: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
        sent: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
        rejected: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
        // Classification badges
        inquiry: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
        complaint: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        support: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
        billing: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
        spam: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
        other: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

// Helper for status badges
const statusLabels: Record<EmailStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  awaiting_approval: 'Awaiting Approval',
  sent: 'Sent',
  rejected: 'Rejected',
};

export function StatusBadge({ status }: { status: EmailStatus }) {
  return (
    <Badge variant={status}>
      {statusLabels[status]}
    </Badge>
  );
}

// Helper for classification badges
export function ClassificationBadge({
  classification,
  confidence
}: {
  classification: string;
  confidence?: number;
}) {
  const variant = ['inquiry', 'complaint', 'support', 'billing', 'spam', 'other'].includes(classification)
    ? classification as 'inquiry' | 'complaint' | 'support' | 'billing' | 'spam' | 'other'
    : 'default';

  return (
    <Badge variant={variant} className="capitalize">
      {classification}
      {confidence !== undefined && (
        <span className="ml-1 opacity-70">{Math.round(confidence * 100)}%</span>
      )}
    </Badge>
  );
}
