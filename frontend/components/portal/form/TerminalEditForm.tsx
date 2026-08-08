'use client';

import { useState } from 'react';
import { portalApiClient, PortalApiError } from '@/lib/portalApiClient';
import type { PortalTerminal, TerminalCategoryTree } from '@/lib/types/portal';
import { TerminalFormFields, type TerminalFormState } from './TerminalFormFields';

interface TerminalEditFormProps {
  terminal: PortalTerminal;
  categories: TerminalCategoryTree[];
}

export function TerminalEditForm({ terminal, categories }: TerminalEditFormProps) {
  const [form, setForm] = useState<TerminalFormState>({
    model: terminal.model ?? '',
    slug: terminal.slug ?? '',
    description: terminal.description ?? '',
    image_url: terminal.image_url ?? '',
    external_url: terminal.external_url ?? '',
    sort_order: String(terminal.sort_order ?? 0),
    category_id: terminal.category_id ?? '',
    applicable_specs_json: JSON.stringify(terminal.applicable_specs ?? [], null, 2),
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleChange(patch: Partial<TerminalFormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
    if (patch.applicable_specs_json !== undefined) {
      validateJsonField('applicable_specs_json', patch.applicable_specs_json);
    }
  }

  function validateJsonField(field: 'applicable_specs_json', text: string) {
    setErrors((prev) => {
      const next = { ...prev };
      if (!text.trim()) {
        delete next[field];
        return next;
      }
      try {
        JSON.parse(text);
        delete next[field];
      } catch (e) {
        next[field] = `Invalid JSON: ${(e as Error).message}`;
      }
      return next;
    });
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.model.trim()) e.model = 'Model is required';
    if (!form.slug.trim()) e.slug = 'Slug is required';
    if (!form.category_id) e.category_id = 'Category is required';
    if (form.sort_order && isNaN(Number(form.sort_order))) e.sort_order = 'Sort order must be numeric';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    validateJsonField('applicable_specs_json', form.applicable_specs_json);

    let hasJsonError = false;
    const payload: Parameters<typeof portalApiClient.terminals.update>[1] = {
      model: form.model,
      slug: form.slug,
      description: form.description,
      image_url: form.image_url,
      external_url: form.external_url,
      sort_order: Number(form.sort_order),
      category_id: form.category_id,
    };
    if (form.applicable_specs_json.trim()) {
      try {
        payload.applicable_specs = JSON.parse(form.applicable_specs_json);
      } catch (e) {
        setErrors((prev) => ({ ...prev, applicable_specs_json: `Invalid JSON: ${(e as Error).message}` }));
        hasJsonError = true;
      }
    }
    if (hasJsonError) return;

    setSaving(true);
    setMessage('');
    setErrors({});
    try {
      await portalApiClient.terminals.update(terminal.id, payload);
      setMessage('Saved');
    } catch (err) {
      if (err instanceof PortalApiError && err.fieldErrors) setErrors(err.fieldErrors);
      else if (err instanceof PortalApiError) setMessage(err.message);
      else setMessage('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4 rounded-lg bg-white p-6 shadow-sm">
      <TerminalFormFields value={form} onChange={handleChange} errors={errors} categories={categories} />
      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded bg-accent-foreground px-4 py-2 text-sm font-medium text-background hover:brightness-95 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      {message && <p className="text-sm text-gray-600">{message}</p>}
    </div>
  );
}
