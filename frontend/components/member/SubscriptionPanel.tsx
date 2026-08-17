'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { SubscriptionStatus } from '@/lib/types';

export function SubscriptionPanel({ subscription }: { subscription: SubscriptionStatus }) {
  const [sub, setSub] = useState(subscription);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startTrial() {
    if (!confirm('Start a 14-day Personal trial? You can cancel anytime.')) return;
    setBusy(true); setError(null);
    const res = await fetch('/api/member/subscription/trial', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billing_cycle: 'monthly' }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) setSub(body); else setError(body.message || 'Failed to start trial');
  }

  async function cancel() {
    if (!confirm('Cancel your subscription? You keep access until the period ends, then downgrade to Freemium.')) return;
    setBusy(true); setError(null);
    const res = await fetch('/api/member/subscription/cancel', { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) setSub({ ...sub, status: 'cancelled' }); else setError(body.message || 'Failed to cancel');
  }

  return (
    <div className="rounded-xl border border-border p-6">
      <h2 className="text-lg font-semibold">Subscription</h2>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">Plan</dt><dd>{sub.plan_name}</dd>
        <dt className="text-muted-foreground">Status</dt><dd className="capitalize">{sub.status}</dd>
        {sub.billing_cycle && <><dt className="text-muted-foreground">Billing</dt><dd className="capitalize">{sub.billing_cycle}</dd></>}
        {sub.trial_end && <><dt className="text-muted-foreground">Trial ends</dt><dd>{new Date(sub.trial_end).toLocaleDateString()}</dd></>}
        {sub.current_period_end && <><dt className="text-muted-foreground">Period ends</dt><dd>{new Date(sub.current_period_end).toLocaleDateString()}</dd></>}
        {sub.gateway && <><dt className="text-muted-foreground">Payment</dt><dd className="capitalize">{sub.gateway}</dd></>}
      </dl>

      {sub.status === 'paid' && sub.current_period_end && (
        <p className="mt-2 text-sm text-muted-foreground">
          Active — renews on {new Date(sub.current_period_end).toLocaleDateString()}.
        </p>
      )}

      {sub.status === 'past_due' && sub.grace_period_end && (
        <div className="mt-2 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-800">
          <strong>Payment failed.</strong> Update your payment method before {new Date(sub.grace_period_end).toLocaleDateString()} to keep your subscription.
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {sub.tier_level === 'freemium' && (
          <>
            <button onClick={startTrial} disabled={busy} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
              Start Free Trial
            </button>
            <Link href="/member/checkout?plan=personal&cycle=monthly"
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground text-center hover:brightness-95">
              Start Paid Subscription
            </Link>
          </>
        )}
        {sub.status === 'trialing' && (
          <Link href="/member/checkout?plan=personal&cycle=monthly"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground text-center hover:brightness-95">
            Upgrade to Paid
          </Link>
        )}
        {(sub.status === 'active' || sub.status === 'trialing' || sub.status === 'paid' || sub.status === 'past_due') && (
          <button onClick={cancel} disabled={busy} className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-50">
            Cancel Subscription
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
