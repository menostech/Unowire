'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

type Category = 'cable' | 'equipment' | 'terminal';

const PLACEHOLDERS: Record<Category, string> = {
  cable: 'Search cable model, spec...',
  equipment: 'Search equipment model, brand...',
  terminal: 'Search terminal model, brand...',
};

const ROUTES: Record<Category, string> = {
  cable: '/cables',
  equipment: '/equipment',
  terminal: '/terminals',
};

function SearchBoxInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [category, setCategory] = useState<Category>('cable');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const base = ROUTES[category];
    if (q.trim()) {
      router.push(`${base}?q=${encodeURIComponent(q.trim())}`);
    } else {
      router.push(base);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as Category)}
        aria-label="Search category"
        className="absolute left-1 top-1/2 -translate-y-1/2 h-8 w-24 border-0 bg-transparent text-sm text-gray-600 focus:outline-none cursor-pointer"
      >
        <option value="cable">Cable</option>
        <option value="equipment">Equipment</option>
        <option value="terminal">Terminal</option>
      </select>
      <div className="absolute left-[6.5rem] top-1/2 -translate-y-1/2 h-6 w-px bg-gray-200" aria-hidden="true" />
      <input
        type="text"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={PLACEHOLDERS[category]}
        className="w-full h-10 pl-28 pr-10 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600"
        aria-label="Search"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </button>
    </form>
  );
}

export function SearchBox() {
  return (
    <Suspense fallback={<div className="h-10" />}>
      <SearchBoxInner />
    </Suspense>
  );
}
