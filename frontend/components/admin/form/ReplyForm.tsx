'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ReplyForm({ inquiryId }: { inquiryId: number }) {
  const router = useRouter();
  const [replyBody, setReplyBody] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/inquiries/${inquiryId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply_body: replyBody }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Reply failed');
      } else {
        router.refresh();
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <div className="bg-red-50 text-red-600 p-2 rounded text-sm">{error}</div>}
      <div>
        <label htmlFor="reply" className="block text-sm font-medium mb-1">Reply</label>
        <textarea
          id="reply"
          value={replyBody}
          onChange={e => setReplyBody(e.target.value)}
          required
          rows={5}
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="Type your reply..."
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
      >
        {loading ? 'Sending...' : 'Send Reply'}
      </button>
    </form>
  );
}
