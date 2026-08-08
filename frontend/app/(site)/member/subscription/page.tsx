import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { UsageSummaryCard } from '@/components/member/UsageSummaryCard';
import { SubscriptionPanel } from '@/components/member/SubscriptionPanel';
import type { SubscriptionStatus, UsageSummary } from '@/lib/types';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export default async function MemberSubscriptionPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('member_token')?.value;
  if (!token) redirect('/login');

  const headers = { Authorization: `Bearer ${token}` };
  const [subRes, usageRes] = await Promise.all([
    fetch(`${API_BASE}/api/member/subscription`, { headers, cache: 'no-store' }),
    fetch(`${API_BASE}/api/member/usage`, { headers, cache: 'no-store' }),
  ]);
  if (!subRes.ok || !usageRes.ok) redirect('/login');
  const subscription: SubscriptionStatus = await subRes.json();
  const usage: UsageSummary = await usageRes.json();

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Subscription &amp; Usage</h1>
      <div className="grid gap-6 md:grid-cols-2">
        <SubscriptionPanel subscription={subscription} />
        <UsageSummaryCard summary={usage} />
      </div>
    </div>
  );
}
