import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  refreshStatus?: string | null;
  children?: React.ReactNode;
}

export function Header({
  title,
  subtitle,
  onRefresh,
  isRefreshing,
  refreshStatus,
  children,
}: HeaderProps) {
  return (
    <header className="mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {children}

          {onRefresh && (
            <Button
              onClick={onRefresh}
              disabled={isRefreshing}
              variant="primary"
              className="gap-2"
            >
              <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
              {isRefreshing ? 'Refreshing...' : 'Refresh Emails'}
            </Button>
          )}
        </div>
      </div>

      {refreshStatus && (
        <div className="mt-3 flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          {refreshStatus}
        </div>
      )}
    </header>
  );
}
