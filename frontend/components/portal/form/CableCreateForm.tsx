'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalApiClient, PortalApiError } from '@/lib/portalApiClient';
import type { TaxonomyIndustry } from '@/lib/types/portal';
import { CableFormFields, type CableFormState } from './CableFormFields';

interface CableCreateFormProps {
  taxonomy: TaxonomyIndustry[];
}

// Derive a URL-safe slug from a model name: lowercase, replace non-alphanumeric
// runs with `-`, then trim leading/trailing `-`.
function slugify(model: string): string {
  return model
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function CableCreateForm({ taxonomy }: CableCreateFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<CableFormState>({
    model: '',
    slug: '',
    size_system: 'awg',
    base_description: '',
    meta_title: '',
    meta_description: '',
    image_url: '',
    industry_id: '',
    category_id: '',
    product_type_id: '',
    common_specs_json: '',
    variants_json: '',
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState('');

  function handleChange(patch: Partial<CableFormState>) {
    // Mark slug as manually edited so auto-derivation stops.
    if (patch.slug !== undefined) {
      setSlugTouched(true);
    }
    setForm((prev) => {
      const next = { ...prev, ...patch };
      // Auto-derive slug from model unless the user has manually edited the slug.
      if (patch.model !== undefined && !slugTouched) {
        next.slug = slugify(patch.model);
      }
      return next;
    });
    // Validate JSON textareas on change (empty text is valid — clears the error).
    if (patch.common_specs_json !== undefined) {
      validateJsonField('common_specs_json', patch.common_specs_json);
    }
    if (patch.variants_json !== undefined) {
      validateJsonField('variants_json', patch.variants_json);
    }
  }

  function validateJsonField(field: 'common_specs_json' | 'variants_json', text: string) {
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
    if (!form.size_system) e.size_system = 'Size system is required';
    if (!form.industry_id) e.industry_id = 'Industry is required';
    if (!form.category_id) e.category_id = 'Category is required';
    if (!form.product_type_id) e.product_type_id = 'Product type is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    // Re-validate JSON textareas defensively before submit.
    validateJsonField('common_specs_json', form.common_specs_json);
    validateJsonField('variants_json', form.variants_json);
    // Block submit if any JSON error is present (re-reads errors via setState callback
    // are async; instead we re-parse synchronously here and bail on failure).
    let hasJsonError = false;
    const payload: Parameters<typeof portalApiClient.cables.create>[0] = {
      model: form.model,
      slug: form.slug,
      size_system: form.size_system,
      base_description: form.base_description,
      meta_title: form.meta_title,
      meta_description: form.meta_description,
      image_url: form.image_url,
      industry_id: form.industry_id,
      category_id: form.category_id,
      product_type_id: form.product_type_id,
    };
    if (form.common_specs_json.trim()) {
      try {
        payload.common_specs = JSON.parse(form.common_specs_json);
      } catch (e) {
        setErrors((prev) => ({ ...prev, common_specs_json: `Invalid JSON: ${(e as Error).message}` }));
        hasJsonError = true;
      }
    }
    if (form.variants_json.trim()) {
      try {
        payload.variants = JSON.parse(form.variants_json);
      } catch (e) {
        setErrors((prev) => ({ ...prev, variants_json: `Invalid JSON: ${(e as Error).message}` }));
        hasJsonError = true;
      }
    }
    if (hasJsonError) return;

    setSubmitting(true);
    setErrorMessage('');
    setErrors({});
    try {
      const created = await portalApiClient.cables.create(payload);
      router.push(`/portal/cables/${created.id}`);
    } catch (err) {
      // Keep the user's entered values — only update error state.
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
      <CableFormFields value={form} onChange={handleChange} errors={errors} taxonomy={taxonomy} />
      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="rounded bg-accent-foreground px-4 py-2 text-sm font-medium text-background hover:brightness-95 disabled:opacity-50"
      >
        {submitting ? 'Creating…' : 'Create'}
      </button>
    </div>
  );
}
