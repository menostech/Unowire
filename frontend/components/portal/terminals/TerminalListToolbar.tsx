'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

interface Props {
  categories: { id: string; label: string; parent_label?: string | null }[];
}

export function TerminalListToolbar({ categories }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [search, setSearch] = useState(sp.get('search') ?? '');
  const selectedCategory = sp.get('category_id') ?? '';

  function pushParams(mutator: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(sp.toString());
    mutator(params);
    for (const key of [...params.keys()]) {
      if (!params.get(key)) params.delete(key);
    }
    const qs = params.toString();
    router.push(qs ? `/portal/connectivity?${qs}` : '/portal/connectivity');
  }

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    pushParams((p) => {
      p.set('search', search.trim());
      p.delete('page');
    });
  }

  function handleCategoryChange(value: string) {
    pushParams((p) => {
      if (value) p.set('category_id', value);
      else p.delete('category_id');
      p.delete('page');
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
        <button type="submit" className="rounded-md bg-accent-foreground px-3 py-1.5 text-sm font-medium text-background hover:brightness-95">
          Search
        </button>
      </form>
      <select
        value={selectedCategory}
        onChange={(e) => handleCategoryChange(e.target.value)}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
      >
        <option value="">All Categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.parent_label ? `${c.parent_label} — ${c.label}` : c.label}
          </option>
        ))}
      </select>
    </div>
  );
}

