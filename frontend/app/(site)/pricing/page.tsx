import { cookies } from 'next/headers';
import { Container } from '@/components/layout/Container';
import { api } from '@/lib/api';
import { PricingCard } from '@/components/pricing/PricingCard';
import type { Plan, SubscriptionStatus } from '@/lib/types';

export const metadata = { title: 'Pricing — UnoWire' };

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

async function getCurrentSubscription(token: string | undefined): Promise<SubscriptionStatus | null> {
  if (!token) return null;
  const res = await fetch(`${API_BASE}/api/member/subscription`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function PricingPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('member_token')?.value;
  const [plans, current] = await Promise.all([api.plans.all(), getCurrentSubscription(token)]);
  const currentTier = current?.tier_level ?? null;

  return (
    <Container className="py-12">
      <h1 className="text-3xl font-bold tracking-tight">Plans &amp; Pricing</h1>
      <p className="mt-2 text-muted-foreground">Choose the plan that fits your engineering workflow.</p>
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {plans.map((plan: Plan) => (
          <PricingCard key={plan.id} plan={plan} isCurrent={currentTier === plan.tier_level} memberToken={token} />
        ))}
      </div>
    </Container>
  );
}
