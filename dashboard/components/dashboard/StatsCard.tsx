import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import type { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: number | string;
  hint?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: 'default' | 'primary' | 'amber' | 'purple' | 'green';
  onClick?: () => void;
  isActive?: boolean;
}

const colorStyles = {
  default: {
    value: 'text-slate-900 dark:text-white',
    icon: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  },
  primary: {
    value: 'text-primary-600 dark:text-primary-400',
    icon: 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400',
  },
  amber: {
    value: 'text-amber-600 dark:text-amber-400',
    icon: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  },
  purple: {
    value: 'text-purple-600 dark:text-purple-400',
    icon: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  },
  green: {
    value: 'text-emerald-600 dark:text-emerald-400',
    icon: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
};

export function StatsCard({
  title,
  value,
  hint,
  icon: Icon,
  trend,
  color = 'default',
  onClick,
  isActive,
}: StatsCardProps) {
  const styles = colorStyles[color];

  return (
    <Card
      hover={!!onClick}
      onClick={onClick}
      className={cn(
        'relative overflow-hidden transition-all duration-200',
        onClick && 'cursor-pointer',
        isActive && 'ring-2 ring-primary-500 ring-offset-2 dark:ring-offset-slate-900'
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {title}
          </p>
          <p className={cn('mt-2 text-3xl font-bold', styles.value)}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {hint && (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              {hint}
            </p>
          )}
          {trend && (
            <div className={cn(
              'mt-2 flex items-center text-xs font-medium',
              trend.isPositive ? 'text-emerald-600' : 'text-red-600'
            )}>
              <span>{trend.isPositive ? '+' : ''}{trend.value}%</span>
              <span className="ml-1 text-slate-400">vs last week</span>
            </div>
          )}
        </div>

        {Icon && (
          <div className={cn('p-2.5 rounded-lg', styles.icon)}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </Card>
  );
}

// Loading skeleton version
export function StatsCardSkeleton() {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <div className="h-4 w-20 skeleton" />
          <div className="h-8 w-16 skeleton" />
          <div className="h-3 w-24 skeleton" />
        </div>
        <div className="w-10 h-10 skeleton rounded-lg" />
      </div>
    </Card>
  );
}
