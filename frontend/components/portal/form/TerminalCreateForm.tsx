'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalApiClient, PortalApiError } from '@/lib/portalApiClient';
import type { TerminalCategoryTree } from '@/lib/types/portal';
import { TerminalFormFields, type TerminalFormState } from './TerminalFormFields';

interface TerminalCreateFormProps {
  categories: TerminalCategoryTree[];
}

function deriveSlug(model: string): string {
  return model
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function TerminalCreateForm({ categories }: TerminalCreateFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<TerminalFormState>({
    model: '',
    slug: '',
    description: '',
    image_url: '',
    external_url: '',
    sort_order: '0',
    category_id: '',
    applicable_specs_json: '',
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState('');

  function handleChange(patch: Partial<TerminalFormState>) {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      // Auto-derive slug from model unless the user has manually edited the slug.
      if (patch.model !== undefined && !slugTouched) {
        next.slug = deriveSlug(patch.model);
      }
      return next;
    });
    // If the user edited the slug directly, mark it as touched so we stop
    // overwriting their value.
    if (patch.slug !== undefined) {
      setSlugTouched(true);
    }
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

  async function handleSubmit() {
    if (!validate()) return;
    validateJsonField('applicable_specs_json', form.applicable_specs_json);

    let hasJsonError = false;
    const payload: Parameters<typeof portalApiClient.terminals.create>[0] = {
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

    setSubmitting(true);
    setErrorMessage('');
    setErrors({});
    try {
      const created = await portalApiClient.terminals.create(payload);
      router.push(`/portal/terminals/${created.id}`);
    } catch (err) {
      if (err instanceof PortalApiError && err.fieldErrors) {
        setErrors(err.fieldErrors);
      } else if (err instanceof PortalApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Network error');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4 rounded-lg bg-white p-6 shadow-sm">
      <TerminalFormFields value={form} onChange={handleChange} errors={errors} categories={categories} />
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? 'Creating…' : 'Create'}
      </button>
      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
    </div>
  );
}
