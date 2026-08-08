'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { RecipientTarget, RecipientGroupValue } from '@/lib/types';

type Mode = 'broadcast' | 'targeted' | 'single';

const GROUP_LABELS: Record<RecipientGroupValue, string> = {
  cable_managers: 'Cable Managers',
  equipment_managers: 'Equipment Managers',
  members: 'All Members',
};

function MessageFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Single mode is activated by URL params set from list-page Message buttons.
  const urlRecipientType = searchParams.get('recipientType');
  const urlRecipientKind = searchParams.get('recipientKind');
  const urlRecipientId = searchParams.get('recipientId');
  const urlRecipientLabel = searchParams.get('recipientLabel');

  const isSingleMode =
    urlRecipientType === 'targeted' && !!urlRecipientKind && !!urlRecipientId;
  const [mode, setMode] = useState<Mode>(isSingleMode ? 'single' : 'broadcast');
  const [selectedGroups, setSelectedGroups] = useState<Set<RecipientGroupValue>>(new Set());

  function toggleGroup(group: RecipientGroupValue) {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  function buildRecipientTargets(): RecipientTarget[] | null {
    if (mode === 'broadcast') return null;
    if (mode === 'single' && urlRecipientKind && urlRecipientId) {
      return [{ kind: urlRecipientKind as 'user' | 'member', value: urlRecipientId }];
    }
    if (mode === 'targeted') {
      return Array.from(selectedGroups).map((g) => ({ kind: 'group' as const, value: g }));
    }
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === 'targeted' && selectedGroups.size === 0) {
      setError('Select at least one recipient group.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title,
        body,
        recipient_type: mode === 'broadcast' ? ('broadcast' as const) : ('targeted' as const),
        recipient_targets: buildRecipientTargets(),
      };
      const res = await fetch('/api/admin/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed (${res.status})`);
      }
      router.push('/admin/messages');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  function clearSingleMode() {
    // "Change" link — return to broadcast mode by clearing URL params.
    router.replace('/admin/messages/new');
    setMode('broadcast');
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      {/* Recipient selector — hidden in single mode (recipient pre-filled from URL). */}
      {mode === 'single' ? (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-gray-500">To:</span>{' '}
              <span className="text-sm font-medium text-gray-900">{urlRecipientLabel}</span>
            </div>
            <button
              type="button"
              onClick={clearSingleMode}
              className="text-xs text-accent-foreground hover:underline"
            >
              Change
            </button>
          </div>
        </div>
      ) : (
        <div>
          <label className="mb-2 block text-sm font-medium">Recipients</label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="recipient-mode"
                checked={mode === 'broadcast'}
                onChange={() => setMode('broadcast')}
              />
              Broadcast to all members
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="recipient-mode"
                checked={mode === 'targeted'}
                onChange={() => setMode('targeted')}
              />
              Targeted recipients
            </label>
          </div>
          {mode === 'targeted' && (
            <div className="mt-3 space-y-2 pl-6">
              {(Object.keys(GROUP_LABELS) as RecipientGroupValue[]).map((g) => (
                <label key={g} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedGroups.has(g)}
                    onChange={() => toggleGroup(g)}
                  />
                  {GROUP_LABELS[g]}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <label htmlFor="msg_title" className="mb-1 block text-sm font-medium">
          Title
        </label>
        <input
          id="msg_title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground"
        />
      </div>
      <div>
        <label htmlFor="msg_body" className="mb-1 block text-sm font-medium">
          Body
        </label>
        <textarea
          id="msg_body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={8}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving || (mode === 'targeted' && selectedGroups.size === 0)}
          className="rounded-md bg-accent-foreground px-4 py-2 text-sm font-medium text-background hover:brightness-95 disabled:opacity-50"
        >
          {saving ? 'Publishing...' : 'Publish'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function MessageForm() {
  // useSearchParams requires a Suspense boundary in Next.js App Router.
  return (
    <Suspense fallback={<div className="text-sm text-gray-500">Loading form...</div>}>
      <MessageFormInner />
    </Suspense>
  );
}
