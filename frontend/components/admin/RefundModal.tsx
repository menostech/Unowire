'use client';

import { useState, type FormEvent } from 'react';

export interface RefundModalProps {
  orderId: number;
  order: { id: number; amount_cents: number; currency: string; status: string; gateway: string; gateway_order_id: string | null; created_at: string; updated_at: string; payments: { id: number; type: string; status: string; amount_cents: number; gateway_payment_id: string | null; created_at: string }[] };
  onClose: () => void;
  onSuccess: () => void;
}

const REFUND_WINDOW_DAYS: Record<string, number> = {
  stripe: 90,
  paypal: 180,
};

export function RefundModal({ orderId, order, onClose, onSuccess }: RefundModalProps) {
  const refundedTotal = order.payments
    .filter((p) => p.type === 'refund')
    .reduce((sum, p) => sum + p.amount_cents, 0);
  const refundableRemaining = order.amount_cents - refundedTotal;

  const [amount, setAmount] = useState<string>(String(refundableRemaining));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refund window warning
  const windowDays = REFUND_WINDOW_DAYS[order.gateway] ?? null;
  const orderAgeDays = windowDays
    ? Math.floor((Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const showWindowWarning = windowDays !== null && orderAgeDays > windowDays;

  function formatCurrency(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const amountCents = parseInt(amount, 10);
    if (isNaN(amountCents) || amountCents <= 0) {
      setError('Please enter a valid amount.');
      setBusy(false);
      return;
    }
    if (amountCents > refundableRemaining) {
      setError(`Amount exceeds refundable remaining (${formatCurrency(refundableRemaining)}).`);
      setBusy(false);
      return;
    }

    const isFullRefund = amountCents === refundableRemaining;
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isFullRefund ? {} : { amount: amountCents }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || `Failed (${res.status})`);
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold">Refund Order #{orderId}</h2>

        {/* Summary */}
        <dl className="mb-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Original amount</dt>
            <dd>{formatCurrency(order.amount_cents)} {order.currency.toUpperCase()}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Already refunded</dt>
            <dd>{formatCurrency(refundedTotal)}</dd>
          </div>
          <div className="flex justify-between font-medium">
            <dt className="text-gray-700">Refundable remaining</dt>
            <dd>{formatCurrency(refundableRemaining)}</dd>
          </div>
        </dl>

        {/* Refund window warning */}
        {showWindowWarning && (
          <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
            {'\u26A0'} This order is {orderAgeDays} days old. The {order.gateway} refund window is typically {windowDays} days.
            The refund may be rejected by the gateway.
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Refund amount (cents)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={1}
              max={refundableRemaining}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground"
            />
            <p className="mt-1 text-xs text-gray-500">
              {formatCurrency(parseInt(amount, 10) || 0)} {order.currency.toUpperCase()} · Leave at max for full refund
            </p>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? 'Processing...' : 'Issue Refund'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
