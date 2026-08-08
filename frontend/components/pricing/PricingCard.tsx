'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Plan } from '@/lib/types';
import { EnterpriseContactModal } from './EnterpriseContactModal';

function priceLabel(plan: Plan): string {
  if (plan.tier_level === 'freemium') return 'Free';
  if (plan.is_sales_led) return 'Contact Sales';
  return `$${plan.price_monthly}/mo`;
}

function limitLabel(n: number | null): string {
  if (n === null) return 'Unlimited';
  if (n === 0) return 'Not included';
  return String(n);
}

export function PricingCard({
  plan, isCurrent, memberToken,
}: { plan: Plan; isCurrent: boolean; memberToken?: string }) {
  const [enterpriseOpen, setEnterpriseOpen] = useState(false);
  const cta =
    plan.tier_level === 'freemium'
      ? { label: memberToken ? 'Current Plan' : 'Sign Up', href: memberToken ? null : '/register' }
      : plan.tier_level === 'personal'
        ? { label: isCurrent ? 'Current Plan' : 'Start Free Trial', href: isCurrent ? null : '/member/subscription' }
        : { label: 'Contact Sales', href: null };

  return (
    <div className={`rounded-xl border p-6 flex flex-col gap-4 ${isCurrent ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`}>
      <div>
        <h3 className="text-lg font-semibold">{plan.name}</h3>
        <p className="mt-1 text-2xl font-bold">{priceLabel(plan)}</p>
        {plan.tier_level === 'personal' && (
          <p className="text-xs text-muted-foreground">or ${plan.price_yearly}/yr</p>
        )}
      </div>
      <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        {plan.features.map((f) => (<li key={f}>&bull; {f}</li>))}
        <li>&bull; {limitLabel(plan.search_limit_daily)} daily searches</li>
        <li>&bull; {limitLabel(plan.detail_view_limit_daily)} daily detail views</li>
        <li>&bull; {limitLabel(plan.download_limit_monthly)} monthly downloads</li>
      </ul>
      <div className="mt-auto">
        {plan.tier_level === 'enterprise' ? (
          <>
            <button onClick={() => setEnterpriseOpen(true)}
              className="inline-flex w-full justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-95">
              Contact Sales
            </button>
            {enterpriseOpen && <EnterpriseContactModal onClose={() => setEnterpriseOpen(false)} />}
          </>
        ) : cta.href ? (
          <Link href={cta.href}
            className="inline-flex w-full justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-95">
            {cta.label}
          </Link>
        ) : (
          <span className="inline-flex w-full justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground">
            {cta.label}
          </span>
        )}
      </div>
    </div>
  );
}
