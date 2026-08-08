'use client';

import { useState, type FormEvent } from 'react';

interface CableOption {
  id: string;
  model: string;
  manufacturer?: { name: string } | null;
}

interface ShowcaseInitialData {
  description: string | null;
  founded_year: number | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  featured_cable_ids: string[];
  featured_image: boolean;
  featured_image_sort: number;
  featured_text: boolean;
  featured_text_sort: number;
}

interface ManufacturerShowcaseBlocksProps {
  manufacturerId: string;
  initial: ShowcaseInitialData;
  cables: CableOption[];
  onSaved?: () => void;
}

const inputClass =
  'rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground';

const blockClass = 'space-y-4 rounded-lg border border-gray-200 bg-white p-5';

const labelClass = 'text-sm font-medium text-gray-700';

const saveButtonClass =
  'rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60';

const successClass = 'rounded-md bg-green-50 px-3 py-2 text-sm text-green-700';

const errorClass = 'rounded-md bg-red-50 px-3 py-2 text-sm text-red-700';

async function saveBlock(
  manufacturerId: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/admin/manufacturers/${manufacturerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      return { ok: true };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.message || `Save failed (status ${res.status})` };
  } catch {
    return { ok: false, error: 'Network error, try again' };
  }
}

export function ManufacturerShowcaseBlocks({
  manufacturerId,
  initial,
  cables,
  onSaved,
}: ManufacturerShowcaseBlocksProps) {
  const [description, setDescription] = useState(initial.description ?? '');
  const [foundedYear, setFoundedYear] = useState<number | ''>(
    initial.founded_year ?? '',
  );
  const [introSaving, setIntroSaving] = useState(false);
  const [introError, setIntroError] = useState<string | null>(null);
  const [introSuccess, setIntroSuccess] = useState(false);

  const [featuredCableIds, setFeaturedCableIds] = useState<string[]>(
    initial.featured_cable_ids ?? [],
  );
  const [cablesSaving, setCablesSaving] = useState(false);
  const [cablesError, setCablesError] = useState<string | null>(null);
  const [cablesSuccess, setCablesSuccess] = useState(false);

  const [address, setAddress] = useState(initial.address ?? '');
  const [phone, setPhone] = useState(initial.phone ?? '');
  const [email, setEmail] = useState(initial.email ?? '');
  const [contactSaving, setContactSaving] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactSuccess, setContactSuccess] = useState(false);

  const [featuredImage, setFeaturedImage] = useState(initial.featured_image ?? false);
  const [featuredImageSort, setFeaturedImageSort] = useState<number | ''>(
    initial.featured_image_sort ?? '',
  );
  const [featuredText, setFeaturedText] = useState(initial.featured_text ?? false);
  const [featuredTextSort, setFeaturedTextSort] = useState<number | ''>(
    initial.featured_text_sort ?? '',
  );
  const [recSaving, setRecSaving] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [recSuccess, setRecSuccess] = useState(false);

  async function handleIntroSave(e: FormEvent) {
    e.preventDefault();
    setIntroError(null);
    setIntroSuccess(false);
    setIntroSaving(true);
    const result = await saveBlock(manufacturerId, {
      description: description || null,
      founded_year: foundedYear === '' ? null : Number(foundedYear),
    });
    setIntroSaving(false);
    if (result.ok) {
      setIntroSuccess(true);
      onSaved?.();
      setTimeout(() => setIntroSuccess(false), 2000);
    } else {
      setIntroError(result.error ?? 'Save failed');
    }
  }

  function handleCableToggle(cableId: string) {
    setFeaturedCableIds((prev) =>
      prev.includes(cableId) ? prev.filter((id) => id !== cableId) : [...prev, cableId],
    );
  }

  async function handleCablesSave(e: FormEvent) {
    e.preventDefault();
    setCablesError(null);
    setCablesSuccess(false);
    setCablesSaving(true);
    const result = await saveBlock(manufacturerId, {
      featured_cable_ids: featuredCableIds,
    });
    setCablesSaving(false);
    if (result.ok) {
      setCablesSuccess(true);
      onSaved?.();
      setTimeout(() => setCablesSuccess(false), 2000);
    } else {
      setCablesError(result.error ?? 'Save failed');
    }
  }

  async function handleContactSave(e: FormEvent) {
    e.preventDefault();
    setContactError(null);
    setContactSuccess(false);
    setContactSaving(true);
    const result = await saveBlock(manufacturerId, {
      address: address || null,
      phone: phone || null,
      email: email || null,
    });
    setContactSaving(false);
    if (result.ok) {
      setContactSuccess(true);
      onSaved?.();
      setTimeout(() => setContactSuccess(false), 2000);
    } else {
      setContactError(result.error ?? 'Save failed');
    }
  }

  async function handleRecSave(e: FormEvent) {
    e.preventDefault();
    setRecError(null);
    setRecSuccess(false);
    setRecSaving(true);
    const result = await saveBlock(manufacturerId, {
      featured_image: featuredImage,
      featured_image_sort: featuredImageSort === '' ? 0 : Number(featuredImageSort),
      featured_text: featuredText,
      featured_text_sort: featuredTextSort === '' ? 0 : Number(featuredTextSort),
    });
    setRecSaving(false);
    if (result.ok) {
      setRecSuccess(true);
      onSaved?.();
      setTimeout(() => setRecSuccess(false), 2000);
    } else {
      setRecError(result.error ?? 'Save failed');
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleIntroSave} className={blockClass}>
        <h3 className="text-base font-semibold text-gray-900">Company Intro</h3>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="description" className={labelClass}>
            Description <span className="text-xs text-gray-500">(HTML supported)</span>
          </label>
          <textarea
            id="description"
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="founded_year" className={labelClass}>
            Founded Year
          </label>
          <input
            id="founded_year"
            type="number"
            value={foundedYear}
            onChange={(e) =>
              setFoundedYear(e.target.value === '' ? '' : Number(e.target.value))
            }
            className={inputClass}
          />
        </div>
        {introError && <p className={errorClass}>{introError}</p>}
        {introSuccess && <p className={successClass}>Saved successfully</p>}
        <button type="submit" disabled={introSaving} className={saveButtonClass}>
          {introSaving ? 'Saving…' : 'Save'}
        </button>
      </form>

      <form onSubmit={handleCablesSave} className={blockClass}>
        <h3 className="text-base font-semibold text-gray-900">Featured Cables</h3>
        <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-md p-2 space-y-1">
          {cables.length === 0 ? (
            <p className="text-sm text-gray-500 py-2 text-center">No cables available</p>
          ) : (
            cables.map((cable) => (
              <label
                key={cable.id}
                className="flex items-start gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={featuredCableIds.includes(cable.id)}
                  onChange={() => handleCableToggle(cable.id)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-accent-foreground focus:ring-accent-foreground"
                />
                <div className="text-sm">
                  <div className="font-medium text-gray-900">{cable.model}</div>
                  {cable.manufacturer?.name && (
                    <div className="text-gray-500 text-xs">{cable.manufacturer.name}</div>
                  )}
                </div>
              </label>
            ))
          )}
        </div>
        {cablesError && <p className={errorClass}>{cablesError}</p>}
        {cablesSuccess && <p className={successClass}>Saved successfully</p>}
        <button type="submit" disabled={cablesSaving} className={saveButtonClass}>
          {cablesSaving ? 'Saving…' : 'Save'}
        </button>
      </form>

      <form onSubmit={handleContactSave} className={blockClass}>
        <h3 className="text-base font-semibold text-gray-900">Contact Info</h3>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="address" className={labelClass}>
            Address
          </label>
          <textarea
            id="address"
            rows={3}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className={labelClass}>
            Phone
          </label>
          <input
            id="phone"
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <input
            id="email"
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        {contactError && <p className={errorClass}>{contactError}</p>}
        {contactSuccess && <p className={successClass}>Saved successfully</p>}
        <button type="submit" disabled={contactSaving} className={saveButtonClass}>
          {contactSaving ? 'Saving…' : 'Save'}
        </button>
      </form>

      <form onSubmit={handleRecSave} className={blockClass}>
        <h3 className="text-base font-semibold text-gray-900">Recommendation Slots</h3>
        <div className="flex items-center gap-2">
          <input
            id="featured_image"
            type="checkbox"
            checked={featuredImage}
            onChange={(e) => setFeaturedImage(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-accent-foreground focus:ring-accent-foreground"
          />
          <label htmlFor="featured_image" className={labelClass}>
            Featured Image
          </label>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="featured_image_sort" className={labelClass}>
            Featured Image Sort
          </label>
          <input
            id="featured_image_sort"
            type="number"
            value={featuredImageSort}
            onChange={(e) =>
              setFeaturedImageSort(e.target.value === '' ? '' : Number(e.target.value))
            }
            className={inputClass}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="featured_text"
            type="checkbox"
            checked={featuredText}
            onChange={(e) => setFeaturedText(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-accent-foreground focus:ring-accent-foreground"
          />
          <label htmlFor="featured_text" className={labelClass}>
            Featured Text
          </label>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="featured_text_sort" className={labelClass}>
            Featured Text Sort
          </label>
          <input
            id="featured_text_sort"
            type="number"
            value={featuredTextSort}
            onChange={(e) =>
              setFeaturedTextSort(e.target.value === '' ? '' : Number(e.target.value))
            }
            className={inputClass}
          />
        </div>
        {recError && <p className={errorClass}>{recError}</p>}
        {recSuccess && <p className={successClass}>Saved successfully</p>}
        <button type="submit" disabled={recSaving} className={saveButtonClass}>
          {recSaving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  );
}
