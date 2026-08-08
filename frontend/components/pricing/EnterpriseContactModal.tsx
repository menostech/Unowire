'use client';
import { useState } from 'react';

export function EnterpriseContactModal({ onClose }: { onClose: () => void }) {
  const [companyName, setCompanyName] = useState('');
  const [useCase, setUseCase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch('/api/inquiries/enterprise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_name: companyName, use_case: useCase }),
    });
    setSubmitting(false);
    if (res.ok) {
      setDone(true);
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.message || 'Submission failed');
    }
  }

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-lg border border-border bg-background p-6">
          <h3 className="text-lg font-semibold">Thank you</h3>
          <p className="mt-2 text-sm text-muted-foreground">Our sales team will contact you shortly.</p>
          <button onClick={onClose} className="mt-4 rounded-md border border-border px-4 py-2 text-sm">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-border bg-background p-6 flex flex-col gap-3">
        <h3 className="text-lg font-semibold">Contact Sales</h3>
        <label className="text-sm">
          Company name
          <input required maxLength={200} value={companyName} onChange={(e) => setCompanyName(e.target.value)}
            className="mt-1 w-full rounded-md border border-border px-3 py-2" />
        </label>
        <label className="text-sm">
          Use case
          <textarea required maxLength={2000} value={useCase} onChange={(e) => setUseCase(e.target.value)}
            className="mt-1 w-full rounded-md border border-border px-3 py-2" rows={4} />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm">Cancel</button>
          <button type="submit" disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {submitting ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
