'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { TaxonomyIndustry } from '@/lib/types/portal';

interface Props {
  taxonomy: TaxonomyIndustry[];
}

export function CableListToolbar({ taxonomy }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  const [search, setSearch] = useState(sp.get('search') ?? '');
  const selectedIndustry = sp.get('industry_id') ?? '';
  const selectedCategory = sp.get('category_id') ?? '';
  const selectedProductType = sp.get('product_type_id') ?? '';

  const industryOptions = taxonomy;
  const categoryOptions = selectedIndustry
    ? taxonomy.find((i) => i.id === selectedIndustry)?.categories ?? []
    : [];
  const productTypeOptions = selectedCategory
    ? categoryOptions.find((c) => c.id === selectedCategory)?.product_types ?? []
    : [];

  function pushParams(mutator: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(sp.toString());
    mutator(params);
    for (const key of [...params.keys()]) {
      if (!params.get(key)) params.delete(key);
    }
    const qs = params.toString();
    router.push(qs ? `/portal/cables?${qs}` : '/portal/cables');
  }

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    pushParams((p) => p.set('search', search.trim()));
  }

  function handleIndustryChange(value: string) {
    pushParams((p) => {
      if (value) p.set('industry_id', value);
      else p.delete('industry_id');
      p.delete('category_id');
      p.delete('product_type_id');
    });
  }

  function handleCategoryChange(value: string) {
    pushParams((p) => {
      if (value) p.set('category_id', value);
      else p.delete('category_id');
      p.delete('product_type_id');
    });
  }

  function handleProductTypeChange(value: string) {
    pushParams((p) => {
      if (value) p.set('product_type_id', value);
      else p.delete('product_type_id');
    });
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by model…"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-accent-foreground px-3 py-1.5 text-sm font-medium text-background hover:brightness-95"
        >
          Search
        </button>
      </form>

      <select
        value={selectedIndustry}
        onChange={(e) => handleIndustryChange(e.target.value)}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
      >
        <option value="">All Industries</option>
        {industryOptions.map((i) => (
          <option key={i.id} value={i.id}>{i.label}</option>
        ))}
      </select>

      <select
        value={selectedCategory}
        onChange={(e) => handleCategoryChange(e.target.value)}
        disabled={!selectedIndustry}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:bg-gray-100"
      >
        <option value="">All Categories</option>
        {categoryOptions.map((c) => (
          <option key={c.id} value={c.id}>{c.label}</option>
        ))}
      </select>

      <select
        value={selectedProductType}
        onChange={(e) => handleProductTypeChange(e.target.value)}
        disabled={!selectedCategory}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:bg-gray-100"
      >
        <option value="">All Product Types</option>
        {productTypeOptions.map((pt) => (
          <option key={pt.id} value={pt.id}>{pt.label}</option>
        ))}
      </select>
    </div>
  );
}
