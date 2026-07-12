'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  recipientType: string;
  recipientId: string;
  manufacturerName: string;
  defaultSubject?: string;
}

export function InquiryFormModal({ recipientType, recipientId, manufacturerName, defaultSubject }: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [subject, setSubject] = useState(defaultSubject ?? '');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  function openModal() {
    setIsOpen(true);
    setSubject(defaultSubject ?? '');
    setBody('');
    setError('');
    setSuccess(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/member/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_type: recipientType, recipient_id: recipientId, subject, body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Failed to send inquiry');
      } else {
        setSuccess(true);
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={openModal}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm font-medium"
      >
        Contact {manufacturerName}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        {success ? (
          <div className="text-center">
            <h2 className="text-lg font-bold mb-2">Inquiry Sent</h2>
            <p className="text-sm text-gray-600 mb-4">Your message has been sent to {manufacturerName}.</p>
            <button
              onClick={() => { setIsOpen(false); router.push('/member/inquiries'); }}
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium"
            >
              View My Inquiries
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-bold mb-4">Contact {manufacturerName}</h2>
            {error && <div className="bg-red-50 text-red-600 p-2 rounded mb-3 text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label htmlFor="inquiry_subject" className="block text-sm font-medium mb-1">Subject</label>
                <input
                  id="inquiry_subject"
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  required
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="inquiry_body" className="block text-sm font-medium mb-1">Message</label>
                <textarea
                  id="inquiry_body"
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  required
                  rows={5}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                >
                  {loading ? 'Sending...' : 'Send Inquiry'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="border border-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-50 text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
