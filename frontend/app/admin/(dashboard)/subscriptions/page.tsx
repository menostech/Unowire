import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { SubscriptionsTable } from './SubscriptionsTable';

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; status?: string; gateway?: string; page?: string; page_size?: string }>;
}) {
  const sp = await searchParams;
  const page = parseInt(sp.page || '1', 10);
  const pageSize = parseInt(sp.page_size || '20', 10);

  const data = await adminApi.subscriptions.list({
    plan: sp.plan,
    status: sp.status,
    gateway: sp.gateway,
    page,
    page_size: pageSize,
  });

  const totalPages = Math.max(1, Math.ceil(data.total / pageSize));
  const start = data.total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, data.total);

  // Preserve filters across pagination links
  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    if (sp.plan) params.set('plan', sp.plan);
    if (sp.status) params.set('status', sp.status);
    if (sp.gateway) params.set('gateway', sp.gateway);
    params.set('page', String(n));
    params.set('page_size', String(pageSize));
    return `/admin/subscriptions?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Subscriptions</h1>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap gap-3" method="GET">
        <select
          name="plan"
          defaultValue={sp.plan ?? ''}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground"
        >
          <option value="">All plans</option>
          <option value="freemium">Freemium</option>
          <option value="personal">Personal</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <select
          name="status"
          defaultValue={sp.status ?? ''}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground"
        >
          <option value="">All status</option>
          <option value="active">Active</option>
          <option value="trialing">Trialing</option>
          <option value="past_due">Past Due</option>
          <option value="canceled">Canceled</option>
          <option value="expired">Expired</option>
        </select>
        <select
          name="gateway"
          defaultValue={sp.gateway ?? ''}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground"
        >
          <option value="">All gateways</option>
          <option value="stripe">Stripe</option>
          <option value="paypal">PayPal</option>
          <option value="manual">Manual</option>
        </select>
        <button
          type="submit"
          className="rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          Apply
        </button>
        <Link
          href="/admin/subscriptions"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Clear
        </Link>
      </form>

      {/* Subscriptions table */}
      <SubscriptionsTable subscriptions={data.items} />

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">
          Showing {start}-{end} of {data.total}
        </span>
        <div className="flex items-center gap-4">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="text-accent-foreground hover:underline">
              ← Prev
            </Link>
          ) : (
            <span className="text-gray-300">← Prev</span>
          )}
          <span className="text-gray-600">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className="text-accent-foreground hover:underline">
              Next {'->'}
            </Link>
          ) : (
            <span className="text-gray-300">Next {'->'}</span>
          )}
        </div>
      </div>
    </div>
  );
}
