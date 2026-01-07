import { cn } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';

interface ClassificationChartProps {
  data: {
    inquiry: number;
    complaint: number;
    support: number;
    billing: number;
    spam: number;
    other: number;
    unclassified?: number;
  };
}

const classifications = [
  { key: 'inquiry', label: 'Inquiry', color: 'bg-blue-500' },
  { key: 'support', label: 'Support', color: 'bg-purple-500' },
  { key: 'billing', label: 'Billing', color: 'bg-emerald-500' },
  { key: 'complaint', label: 'Complaint', color: 'bg-red-500' },
  { key: 'spam', label: 'Spam', color: 'bg-slate-400' },
  { key: 'other', label: 'Other', color: 'bg-indigo-500' },
] as const;

export function ClassificationChart({ data }: ClassificationChartProps) {
  const total = Object.entries(data)
    .filter(([key]) => key !== 'unclassified')
    .reduce((sum, [, count]) => sum + count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Classification Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Bar chart */}
        <div className="h-3 rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-700 mb-4">
          {total > 0 && classifications.map(({ key, color }) => {
            const count = data[key];
            if (count === 0) return null;
            const percentage = (count / total) * 100;

            return (
              <div
                key={key}
                className={cn(color, 'h-full transition-all duration-300')}
                style={{ width: `${percentage}%` }}
                title={`${key}: ${count}`}
              />
            );
          })}
        </div>

        {/* Legend */}
        <div className="grid grid-cols-3 gap-3">
          {classifications.map(({ key, label, color }) => {
            const count = data[key];
            const percentage = total > 0 ? Math.round((count / total) * 100) : 0;

            return (
              <div
                key={key}
                className="flex items-center gap-2 text-sm"
              >
                <div className={cn('w-2.5 h-2.5 rounded-full', color)} />
                <span className="text-slate-600 dark:text-slate-400">{label}</span>
                <span className="ml-auto font-medium text-slate-900 dark:text-slate-100">
                  {count}
                </span>
                <span className="text-slate-400 dark:text-slate-500 text-xs">
                  {percentage}%
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// Loading skeleton
export function ClassificationChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 w-40 skeleton" />
      </CardHeader>
      <CardContent>
        <div className="h-3 skeleton rounded-full mb-4" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 skeleton rounded-full" />
              <div className="h-4 w-12 skeleton" />
              <div className="ml-auto h-4 w-6 skeleton" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
