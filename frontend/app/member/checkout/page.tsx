'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function CheckoutInner() {
  const params = useSearchParams();
  const router = useRouter();
  const plan = params.get('plan') || 'personal';
  const cycle = params.get('cycle') || 'monthly';
  const status = params.get('status');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(status === 'cancelled' ? 'Payment was cancelled. Please try again.' : null);

  async function startCheckout(gateway: 'stripe' | 'paypal') {
    setBusy(gateway);
    setError(null);
    try {
      const res = await fetch('/api/member/subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateway, plan_id: 2, billing_cycle: cycle }),  // plan_id 2 = Personal
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message || 'Failed to start checkout');
        setBusy(null);
        return;
      }
      // Redirect to the gateway-hosted page
      window.location.href = body.redirect_url;
    } catch (e) {
      setError('Network error — please try again');
      setBusy(null);
    }
  }

  const priceLabel = cycle === 'monthly' ? '$15/month' : '$149/year';

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold">Subscribe to Personal</h1>
      <p className="mt-2 text-muted-foreground">
        {plan.charAt(0).toUpperCase() + plan.slice(1)} plan, billed {cycle}.
      </p>
      <div className="mt-4 rounded-lg border border-border p-4">
        <div className="flex justify-between text-sm">
          <span>Plan</span><span className="font-medium capitalize">{plan}</span>
        </div>
        <div className="mt-1 flex justify-between text-sm">
          <span>Billing</span><span className="font-medium capitalize">{cycle}</span>
        </div>
        <div className="mt-1 flex justify-between text-sm">
          <span>Price</span><span className="font-medium">{priceLabel}</span>
        </div>
      </div>

      <h2 className="mt-6 text-sm font-medium">Choose a payment method</h2>
      <div className="mt-2 flex flex-col gap-2">
        <button
          onClick={() => startCheckout('stripe')}
          disabled={busy !== null}
          className="rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy === 'stripe' ? 'Redirecting…' : 'Pay with Stripe'}
        </button>
        <button
          onClick={() => startCheckout('paypal')}
          disabled={busy !== null}
          className="rounded-md border border-border px-4 py-3 text-sm font-semibold disabled:opacity-50"
        >
          {busy === 'paypal' ? 'Redirecting…' : 'Pay with PayPal'}
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <p className="mt-4 text-xs text-muted-foreground">
        <Link href="/pricing" className="underline">Back to pricing</Link>
      </p>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-4 py-12">Loading…</div>}>
      <CheckoutInner />
    </Suspense>
  );
}
