import type { UsageSummary } from '@/lib/types';

function ProgressBar({ used, limit }: { used: number; limit: number | null }) {
  const unlimited = limit === null;
  const disabled = limit === 0;
  const pct = unlimited || disabled ? 0 : Math.min(100, Math.round((used / (limit as number)) * 100));
  const label = unlimited ? 'Unlimited' : disabled ? 'Not included' : `${used} / ${limit}`;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        {!unlimited && !disabled && <span className="text-muted-foreground">{pct}%</span>}
      </div>
      <div className="mt-1 h-2 rounded-full bg-secondary">
        <div className="h-2 rounded-full bg-primary" style={{ width: unlimited ? '100%' : `${pct}%` }} />
      </div>
    </div>
  );
}

export function UsageSummaryCard({ summary }: { summary: UsageSummary }) {
  return (
    <div className="rounded-xl border border-border p-6">
      <h2 className="text-lg font-semibold">Usage this period</h2>
      <p className="text-sm text-muted-foreground">Current plan: {summary.plan}</p>
      <div className="mt-4 flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium">Daily searches</p>
          <ProgressBar used={summary.today.search.used} limit={summary.today.search.limit} />
        </div>
        <div>
          <p className="text-sm font-medium">Daily detail views</p>
          <ProgressBar used={summary.today.detail_view.used} limit={summary.today.detail_view.limit} />
        </div>
        <div>
          <p className="text-sm font-medium">Monthly downloads</p>
          <ProgressBar used={summary.this_month.download.used} limit={summary.this_month.download.limit} />
        </div>
      </div>
    </div>
  );
}
