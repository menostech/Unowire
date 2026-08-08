'use client';

import { useState, useEffect, type FormEvent } from 'react';

interface EnterpriseSubscriptionFormProps {
  memberId: number;
}

export function EnterpriseSubscriptionForm({ memberId }: EnterpriseSubscriptionFormProps) {
  const [periodEnd, setPeriodEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Default to one year from today. Computed in an effect to avoid SSR/CSR
  // hydration mismatch (server and client "now" differ).
  useEffect(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    setPeriodEnd(d.toISOString().slice(0, 10));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/members/${memberId}/subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_end: periodEnd }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed (${res.status})`);
      }
      const data = await res.json();
      const until = data.period_end ? new Date(data.period_end).toLocaleDateString() : '';
      setSuccess(`Enterprise subscription created${until ? ` (valid until ${until})` : ''}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium">Subscription End Date</label>
        <input
          type="date"
          value={periodEnd}
          onChange={(e) => setPeriodEnd(e.target.value)}
          required
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground"
        />
        <p className="mt-1 text-xs text-gray-500">Defaults to one year from today.</p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      <button
        type="submit"
        disabled={saving || !periodEnd}
        className="rounded-md bg-accent-foreground px-4 py-2 text-sm font-medium text-background hover:brightness-95 disabled:opacity-50"
      >
        {saving ? 'Creating...' : 'Create Enterprise Subscription'}
      </button>
    </form>
  );
}