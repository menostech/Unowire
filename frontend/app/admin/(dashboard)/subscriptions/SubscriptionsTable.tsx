'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { SubscriptionDetail } from '@/components/admin/SubscriptionDetail';

export interface SubscriptionRow {
  id: number;
  member_id: number;
  member_email: string;
  member_name: string | null;
  plan: string;
  status: string;
  billing_cycle: string | null;
  gateway: string | null;
  trial_end: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  trialing: 'bg-blue-100 text-blue-800',
  past_due: 'bg-yellow-100 text-yellow-800',
  canceled: 'bg-gray-100 text-gray-600',
  expired: 'bg-red-100 text-red-800',
  incomplete: 'bg-yellow-100 text-yellow-800',
};

function formatDate(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

export function SubscriptionsTable({ subscriptions }: { subscriptions: SubscriptionRow[] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (subscriptions.length === 0) {
    return (
      <div className="rounded-md border border-gray-200 px-4 py-8 text-center text-gray-500">
        No subscriptions found.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left font-medium">Member</th>
            <th className="px-4 py-2 text-left font-medium">Plan</th>
            <th className="px-4 py-2 text-left font-medium">Status</th>
            <th className="px-4 py-2 text-left font-medium">Gateway</th>
            <th className="px-4 py-2 text-left font-medium">Current Period</th>
            <th className="px-4 py-2 text-left font-medium">Created</th>
            <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {subscriptions.map((sub) => {
            const isExpanded = expandedId === sub.id;
            return (
              <Fragment key={sub.id}>
                <tr className="border-t border-gray-100">
                  <td className="px-4 py-2">
                    <Link
                      href={`/admin/members/${sub.member_id}`}
                      className="text-accent-foreground hover:underline"
                    >
                      {sub.member_name || sub.member_email}
                    </Link>
                    <div className="text-xs text-gray-500">{sub.member_email}</div>
                  </td>
                  <td className="px-4 py-2">{sub.plan}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[sub.status] || 'bg-gray-100 text-gray-600'}`}>
                      {sub.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-500">{sub.gateway ?? '-'}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {formatDate(sub.current_period_start)} - {formatDate(sub.current_period_end)}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {formatDate(sub.created_at)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                      className="text-accent-foreground hover:underline"
                    >
                      {isExpanded ? 'Collapse' : 'Expand'}
                    </button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="border-t border-gray-100">
                    <td colSpan={7} className="bg-gray-50 px-4 py-4">
                      <SubscriptionDetail subscriptionId={sub.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
