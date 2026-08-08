'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Plan } from '@/lib/types';

interface PlanFormProps {
  mode: 'create' | 'edit';
  initialData?: Plan;
}

export function PlanForm({ mode, initialData }: PlanFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialData?.name ?? '');
  const [tierLevel, setTierLevel] = useState(initialData?.tier_level ?? '');
  const [priceMonthly, setPriceMonthly] = useState(initialData?.price_monthly ?? 0);
  const [priceYearly, setPriceYearly] = useState(initialData?.price_yearly ?? 0);
  const [searchLimitDaily, setSearchLimitDaily] = useState<string>(
    initialData?.search_limit_daily == null ? '' : String(initialData.search_limit_daily)
  );
  const [detailViewLimitDaily, setDetailViewLimitDaily] = useState<string>(
    initialData?.detail_view_limit_daily == null ? '' : String(initialData.detail_view_limit_daily)
  );
  const [downloadLimitMonthly, setDownloadLimitMonthly] = useState<string>(
    initialData?.download_limit_monthly == null ? '' : String(initialData.download_limit_monthly)
  );
  const [trialDays, setTrialDays] = useState(initialData?.trial_days ?? 0);
  const [isSalesLed, setIsSalesLed] = useState(initialData?.is_sales_led ?? false);
  const [isActive, setIsActive] = useState(initialData?.is_active ?? true);
  const [featuresText, setFeaturesText] = useState((initialData?.features ?? []).join('\n'));
  const [sortOrder, setSortOrder] = useState(initialData?.sort_order ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const features = featuresText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const payload: Record<string, unknown> = {
      name,
      price_monthly: priceMonthly,
      price_yearly: priceYearly,
      search_limit_daily: searchLimitDaily === '' ? null : parseInt(searchLimitDaily) || 0,
      detail_view_limit_daily: detailViewLimitDaily === '' ? null : parseInt(detailViewLimitDaily) || 0,
      download_limit_monthly: downloadLimitMonthly === '' ? null : parseInt(downloadLimitMonthly) || 0,
      trial_days: trialDays,
      is_sales_led: isSalesLed,
      is_active: isActive,
      features,
      sort_order: sortOrder,
    };
    if (mode === 'create') {
      payload.tier_level = tierLevel;
    }
    try {
      const res = await fetch(
        mode === 'create' ? '/api/admin/plans' : `/api/admin/plans/${initialData!.id}`,
        {
          method: mode === 'create' ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed (${res.status})`);
      }
      router.push('/admin/settings/plans');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initialData) return;
    if (!confirm(`Delete plan "${initialData.name}"? This will deactivate it.`)) return;
    try {
      const res = await fetch(`/api/admin/plans/${initialData.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed (${res.status})`);
      }
      router.push('/admin/settings/plans');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  const inputCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground';
  const disabledCls = 'w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500';

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Tier Level</label>
          {mode === 'create' ? (
            <input
              type="text"
              value={tierLevel}
              onChange={(e) => setTierLevel(e.target.value)}
              required
              placeholder="e.g., freemium, personal, enterprise"
              className={inputCls}
            />
          ) : (
            <input
              type="text"
              value={tierLevel}
              disabled
              className={disabledCls}
            />
          )}
          {mode === 'edit' && (
            <p className="mt-1 text-xs text-gray-500">Tier level is unique and cannot be changed after creation.</p>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Price Monthly</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={priceMonthly}
              onChange={(e) => setPriceMonthly(parseFloat(e.target.value) || 0)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Price Yearly</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={priceYearly}
              onChange={(e) => setPriceYearly(parseFloat(e.target.value) || 0)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Search Limit (daily)</label>
            <input
              type="number"
              min="0"
              value={searchLimitDaily}
              onChange={(e) => setSearchLimitDaily(e.target.value)}
              placeholder="Empty = unlimited, 0 = disabled"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Detail View Limit (daily)</label>
            <input
              type="number"
              min="0"
              value={detailViewLimitDaily}
              onChange={(e) => setDetailViewLimitDaily(e.target.value)}
              placeholder="Empty = unlimited, 0 = disabled"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Download Limit (monthly)</label>
            <input
              type="number"
              min="0"
              value={downloadLimitMonthly}
              onChange={(e) => setDownloadLimitMonthly(e.target.value)}
              placeholder="Empty = unlimited, 0 = disabled"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Trial Days</label>
            <input
              type="number"
              min="0"
              value={trialDays}
              onChange={(e) => setTrialDays(parseInt(e.target.value) || 0)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Sort Order</label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
              className={inputCls}
            />
          </div>
        </div>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isSalesLed}
              onChange={(e) => setIsSalesLed(e.target.checked)}
              className="rounded"
            />
            Sales-led (manual billing)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded"
            />
            Active
          </label>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Features</label>
          <textarea
            value={featuresText}
            onChange={(e) => setFeaturesText(e.target.value)}
            rows={4}
            placeholder="One feature per line (or comma-separated)"
            className={inputCls}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-accent-foreground px-4 py-2 text-sm font-medium text-background hover:brightness-95 disabled:opacity-50"
        >
          {saving ? 'Saving...' : mode === 'create' ? 'Create Plan' : 'Save Changes'}
        </button>
        <Link
          href="/admin/settings/plans"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </Link>
        {mode === 'edit' && (
          <button
            type="button"
            onClick={handleDelete}
            className="ml-auto rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Deactivate
          </button>
        )}
      </div>
    </form>
  );
}