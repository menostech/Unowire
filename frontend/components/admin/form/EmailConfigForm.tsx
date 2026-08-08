'use client';

import { useState, useEffect } from 'react';

interface EmailConfig {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  from_name: string;
  from_email: string;
  use_tls: boolean;
  is_enabled: boolean;
}

export function EmailConfigForm() {
  const [config, setConfig] = useState<EmailConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetch('/api/admin/email/config')
      .then(async res => {
        if (!res.ok) throw new Error('fetch failed');
        return res.json();
      })
      .then(data => {
        setConfig({
          ...data,
          smtp_password: '', // always start empty; user enters new password to update
        });
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        setLoadError(true);
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/email/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('Configuration saved.');
        setConfig({ ...config, smtp_password: '' });
      } else {
        setMessage(data.message || 'Save failed');
      }
    } catch {
      setMessage('Network error');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/email/test', { method: 'POST' });
      const data = await res.json();
      setMessage(data.message || 'Test sent');
    } catch {
      setMessage('Network error');
    } finally {
      setTesting(false);
    }
  }

  if (loadError) return <p className="text-sm text-red-600">Failed to load email configuration.</p>;
  if (loading || !config) return <p className="text-sm text-gray-500">Loading...</p>;

  return (
    <div>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="smtp_host" className="block text-sm font-medium mb-1">SMTP Host</label>
            <input
              id="smtp_host"
              type="text"
              value={config.smtp_host}
              onChange={e => setConfig({ ...config, smtp_host: e.target.value })}
              required
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="smtp_port" className="block text-sm font-medium mb-1">SMTP Port</label>
            <input
              id="smtp_port"
              type="number"
              value={config.smtp_port}
              onChange={e => setConfig({ ...config, smtp_port: parseInt(e.target.value) })}
              required
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="smtp_user" className="block text-sm font-medium mb-1">SMTP User</label>
            <input
              id="smtp_user"
              type="text"
              value={config.smtp_user}
              onChange={e => setConfig({ ...config, smtp_user: e.target.value })}
              required
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="smtp_password" className="block text-sm font-medium mb-1">SMTP Password</label>
            <input
              id="smtp_password"
              type="password"
              value={config.smtp_password}
              onChange={e => setConfig({ ...config, smtp_password: e.target.value })}
              placeholder="Enter password to update"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="from_name" className="block text-sm font-medium mb-1">From Name</label>
            <input
              id="from_name"
              type="text"
              value={config.from_name}
              onChange={e => setConfig({ ...config, from_name: e.target.value })}
              required
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="from_email" className="block text-sm font-medium mb-1">From Email</label>
            <input
              id="from_email"
              type="email"
              value={config.from_email}
              onChange={e => setConfig({ ...config, from_email: e.target.value })}
              required
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.use_tls}
              onChange={e => setConfig({ ...config, use_tls: e.target.checked })}
            />
            Use TLS
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.is_enabled}
              onChange={e => setConfig({ ...config, is_enabled: e.target.checked })}
            />
            Enable Email
          </label>
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-accent-foreground text-background py-2 px-4 rounded hover:brightness-95 disabled:opacity-50 text-sm font-medium"
          >
            {saving ? 'Saving...' : 'Save Config'}
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="border border-gray-300 text-gray-700 py-2 px-4 rounded hover:bg-gray-50 disabled:opacity-50 text-sm font-medium"
          >
            {testing ? 'Sending...' : 'Send Test Email'}
          </button>
        </div>
        {message && <p className="text-sm text-gray-600">{message}</p>}
      </form>
    </div>
  );
}
