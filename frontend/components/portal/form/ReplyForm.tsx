'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ReplyForm({ inquiryId }: { inquiryId: number }) {
  const router = useRouter();
  const [replyBody, setReplyBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!replyBody.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/portal/inquiries/${inquiryId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply_body: replyBody }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || 'Reply failed');
      } else {
        router.refresh();
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-700">Reply</h2>
      <textarea
        value={replyBody}
        onChange={(e) => setReplyBody(e.target.value)}
        rows={5}
        required
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        placeholder="Type your reply…"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Sending…' : 'Send Reply'}
      </button>
    </form>
  );
}
