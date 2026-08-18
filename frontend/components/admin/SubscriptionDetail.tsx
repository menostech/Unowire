'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefundModal } from './RefundModal';

interface Payment {
  id: number;
  type: string;
  status: string;
  amount_cents: number;
  gateway: string;
  gateway_payment_id: string | null;
  created_at: string;
}

interface Order {
  id: number;
  amount_cents: number;
  currency: string;
  status: string;
  gateway: string;
  gateway_order_id: string | null;
  created_at: string;
  updated_at: string;
  payments: Payment[];
}

interface SubscriptionDetail {
  id: number;
  member_id: number;
  member_email: string;
  member_name: string;
  plan: string;
  status: string;
  billing_cycle: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  gateway: string | null;
  gateway_subscription_id: string | null;
  created_at: string;
  orders: Order[];
}

export function SubscriptionDetail({ subscriptionId }: { subscriptionId: number }) {
  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refundOrderId, setRefundOrderId] = useState<number | null>(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/subscriptions/${subscriptionId}`);
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      setDetail(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [subscriptionId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  if (loading) return <p className="text-sm text-gray-500">Loading detail...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!detail) return <p className="text-sm text-gray-500">No data.</p>;

  function formatCurrency(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }

  function refundedTotal(order: Order): number {
    return order.payments
      .filter((p) => p.type === 'refund')
      .reduce((sum, p) => sum + p.amount_cents, 0);
  }

  return (
    <div className="space-y-4">
      {/* Subscription info */}
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <dt className="text-gray-500">Plan</dt>
        <dd className="capitalize">{detail.plan}</dd>
        <dt className="text-gray-500">Status</dt>
        <dd>{detail.status}</dd>
        <dt className="text-gray-500">Gateway</dt>
        <dd>{detail.gateway ?? '-'}</dd>
        <dt className="text-gray-500">Gateway Sub ID</dt>
        <dd className="text-xs">{detail.gateway_subscription_id ?? '-'}</dd>
        <dt className="text-gray-500">Period</dt>
        <dd className="text-xs">
          {detail.current_period_start ? new Date(detail.current_period_start).toLocaleDateString() : '-'}
          {' \u2013 '}
          {detail.current_period_end ? new Date(detail.current_period_end).toLocaleDateString() : '-'}
        </dd>
      </dl>

      {/* Orders */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Orders</h3>
        {detail.orders.length === 0 ? (
          <p className="text-sm text-gray-500">No orders.</p>
        ) : (
          <div className="overflow-hidden rounded border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">ID</th>
                  <th className="px-3 py-2 text-left font-medium">Amount</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Refunded</th>
                  <th className="px-3 py-2 text-left font-medium">Remaining</th>
                  <th className="px-3 py-2 text-left font-medium">Created</th>
                  <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {detail.orders.map((order) => {
                  const refunded = refundedTotal(order);
                  const remaining = order.amount_cents - refunded;
                  return (
                    <tr key={order.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-500">#{order.id}</td>
                      <td className="px-3 py-2">{formatCurrency(order.amount_cents)} {order.currency.toUpperCase()}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-2 py-0.5 text-xs ${
                          order.status === 'refunded' ? 'bg-blue-100 text-blue-800' :
                          order.status === 'partially_refunded' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">{formatCurrency(refunded)}</td>
                      <td className="px-3 py-2">{formatCurrency(remaining)}</td>
                      <td className="px-3 py-2 text-gray-500">{new Date(order.created_at).toLocaleDateString()}</td>
                      <td className="px-3 py-2 text-right">
                        {order.status !== 'refunded' && remaining > 0 && (
                          <button
                            onClick={() => setRefundOrderId(order.id)}
                            className="text-xs text-accent-foreground hover:underline"
                          >
                            Refund
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payments */}
      {detail.orders.some((o) => o.payments.length > 0) && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Payments</h3>
          <div className="overflow-hidden rounded border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">ID</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Amount</th>
                  <th className="px-3 py-2 text-left font-medium">Gateway Ref</th>
                  <th className="px-3 py-2 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {detail.orders.flatMap((order) =>
                  order.payments.map((payment) => (
                    <tr key={payment.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-500">#{payment.id}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-2 py-0.5 text-xs ${
                          payment.type === 'refund' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {payment.type}
                        </span>
                      </td>
                      <td className="px-3 py-2">{payment.status}</td>
                      <td className="px-3 py-2">{formatCurrency(payment.amount_cents)}</td>
                      <td className="px-3 py-2 text-gray-500">{payment.gateway_payment_id ?? '-'}</td>
                      <td className="px-3 py-2 text-gray-500">{new Date(payment.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Refund modal */}
      {refundOrderId !== null && detail && (
        <RefundModal
          orderId={refundOrderId}
          order={detail.orders.find((o) => o.id === refundOrderId)!}
          onClose={() => setRefundOrderId(null)}
          onSuccess={fetchDetail}
        />
      )}
    </div>
  );
}
