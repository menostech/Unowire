'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  is_active: boolean;
}

export function EmailTemplateForm({ templateId }: { templateId: string }) {
  const router = useRouter();
  const [template, setTemplate] = useState<EmailTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/email/templates/${templateId}`)
      .then(async res => {
        if (!res.ok) throw new Error('fetch failed');
        return res.json();
      })
      .then(data => {
        setTemplate(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        setLoadError(true);
      });
  }, [templateId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!template) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`/api/admin/email/templates/${templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: template.name,
          subject: template.subject,
          body: template.body,
          is_active: template.is_active,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('Template saved.');
      } else {
        setMessage(data.message || 'Save failed');
      }
    } catch {
      setMessage('Network error');
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <p className="text-sm text-red-600">Failed to load template.</p>;
  if (loading || !template) return <p className="text-sm text-gray-500">Loading...</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      <div>
        <label htmlFor="template_name" className="block text-sm font-medium mb-1">Template Name</label>
        <input
          id="template_name"
          type="text"
          value={template.name}
          onChange={e => setTemplate({ ...template, name: e.target.value })}
          required
          className="w-full border rounded px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="subject" className="block text-sm font-medium mb-1">Subject</label>
        <input
          id="subject"
          type="text"
          value={template.subject}
          onChange={e => setTemplate({ ...template, subject: e.target.value })}
          required
          className="w-full border rounded px-3 py-2 text-sm font-mono"
        />
        <p className="text-xs text-gray-500 mt-1">Use placeholders like {'{name}'}, {'{verify_url}'}</p>
      </div>
      <div>
        <label htmlFor="body" className="block text-sm font-medium mb-1">Body</label>
        <textarea
          id="body"
          value={template.body}
          onChange={e => setTemplate({ ...template, body: e.target.value })}
          required
          rows={12}
          className="w-full border rounded px-3 py-2 text-sm font-mono"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={template.is_active}
          onChange={e => setTemplate({ ...template, is_active: e.target.checked })}
        />
        Active
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="bg-accent-foreground text-background py-2 px-4 rounded hover:brightness-95 disabled:opacity-50 text-sm font-medium"
        >
          {saving ? 'Saving...' : 'Save Template'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/settings/email')}
          className="border border-gray-300 text-gray-700 py-2 px-4 rounded hover:bg-gray-50 text-sm font-medium"
        >
          Back
        </button>
      </div>
      {message && <p className="text-sm text-gray-600">{message}</p>}
    </form>
  );
}
