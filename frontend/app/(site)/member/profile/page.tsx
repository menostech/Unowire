'use client';

import { useEffect, useState } from 'react';

export default function ProfilePage() {
  const [form, setForm] = useState({ name: '', company: '', phone: '' });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetch('/api/member/auth/me')
      .then(async res => {
        if (!res.ok) throw new Error('fetch failed');
        return res.json();
      })
      .then(data => {
        setForm({
          name: data.name || '',
          company: data.company || '',
          phone: data.phone || '',
        });
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        setLoadError(true);
      });
  }, []);

  if (loadError) return <p className="text-sm text-red-600">Failed to load profile.</p>;
  if (loading) return <p className="text-sm text-gray-500">Loading...</p>;

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Profile</h1>
      <p className="text-sm text-gray-500 mb-4">Profile editing is not available in this MVP. Your account details are shown below.</p>
      <form className="space-y-4 max-w-md">
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-1">Name</label>
          <input
            id="name"
            type="text"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            readOnly
            className="w-full border rounded px-3 py-2 text-sm bg-gray-50 cursor-not-allowed"
          />
        </div>
        <div>
          <label htmlFor="company" className="block text-sm font-medium mb-1">Company</label>
          <input
            id="company"
            type="text"
            value={form.company}
            onChange={e => setForm({ ...form, company: e.target.value })}
            readOnly
            className="w-full border rounded px-3 py-2 text-sm bg-gray-50 cursor-not-allowed"
          />
        </div>
        <div>
          <label htmlFor="phone" className="block text-sm font-medium mb-1">Phone</label>
          <input
            id="phone"
            type="tel"
            value={form.phone}
            onChange={e => setForm({ ...form, phone: e.target.value })}
            readOnly
            className="w-full border rounded px-3 py-2 text-sm bg-gray-50 cursor-not-allowed"
          />
        </div>
      </form>
    </div>
  );
}
