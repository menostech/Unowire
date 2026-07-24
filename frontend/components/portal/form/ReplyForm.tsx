'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalApiClient, PortalApiError } from '@/lib/portalApiClient';

export function ReplyForm({ inquiryId }: { inquiryId: number }) {
  const router = useRouter();
  const [replyBody, setReplyBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!replyBody.trim()) e.reply_body = 'Reply cannot be empty';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setErrors({});
    setError('');
    try {
      await portalApiClient.inquiries.reply(inquiryId, replyBody);
      router.refresh();
    } catch (err) {
      if (err instanceof PortalApiError && err.fieldErrors) setErrors(err.fieldErrors);
      else if (err instanceof PortalApiError) setError(err.message);
      else setError('Network error');
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
      {errors.reply_body && <p className="mt-1 text-sm text-red-600">{errors.reply_body}</p>}
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
