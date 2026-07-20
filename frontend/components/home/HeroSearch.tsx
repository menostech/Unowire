'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';

type TabKey = 'cable' | 'equipment';

const TABS: { key: TabKey; label: string; placeholder: string; action: string }[] = [
  {
    key: 'cable',
    label: 'Cable',
    placeholder: 'Search cable model, e.g. UL1007, AVSS...',
    action: '/cables',
  },
  {
    key: 'equipment',
    label: 'Equipment',
    placeholder: 'Search equipment model or manufacturer...',
    action: '/equipment',
  },
];

const POPULAR_CABLE_SEARCHES = ['UL1007', 'AVSS', 'UL1015', 'UL2468'];
const POPULAR_EQUIPMENT_SEARCHES = ['Komax', 'Alpha 488', 'Gamma 333', 'KMV'];

export function HeroSearch() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('cable');
  const [query, setQuery] = useState('');

  const currentTab = TABS.find(t => t.key === activeTab)!;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q) {
      router.push(`${currentTab.action}?q=${encodeURIComponent(q)}`);
    } else {
      router.push(currentTab.action);
    }
  }

  return (
    <section
      className="relative w-full text-white"
      style={{
        backgroundImage:
          "linear-gradient(rgba(15, 23, 42, 0.65), rgba(15, 23, 42, 0.75)), url('/hero-bg.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="w-full px-8 md:px-12 py-[120px] text-center">
        <h1 className="mb-3 text-4xl font-bold">
          Cable &amp; Equipment Specs Database
        </h1>
        <p className="mb-8 text-lg opacity-90">
          Query cable and equipment specifications. Browse by brand, category, and technical parameters.
        </p>

        {/* Tabs */}
        <div
          className="mb-0 inline-flex overflow-hidden rounded-t-lg border border-white/30"
          role="tablist"
          aria-label="Search target"
        >
          {TABS.map(tab => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setActiveTab(tab.key);
                  setQuery('');
                }}
                className={
                  'border-r border-white/30 px-6 py-2 text-sm font-medium transition last:border-r-0 ' +
                  (isActive
                    ? 'bg-white text-slate-900'
                    : 'bg-white/15 text-white hover:bg-white/25')
                }
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search bar */}
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-xl overflow-hidden rounded-b-lg rounded-tr-lg border-2 border-white"
        >
          <label htmlFor="hero-search" className="sr-only">
            Search {currentTab.label.toLowerCase()}
          </label>
          <input
            id="hero-search"
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={currentTab.placeholder}
            className="flex-1 border-0 px-4 py-3 text-sm text-white outline-none placeholder:text-white/70"
          />
          <button
            type="submit"
            className="bg-blue-600 px-6 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Search
          </button>
        </form>

        {/* Popular searches — per active tab */}
        {(() => {
          const popular = activeTab === 'cable' ? POPULAR_CABLE_SEARCHES : POPULAR_EQUIPMENT_SEARCHES;
          const basePath = activeTab === 'cable' ? '/cables' : '/equipment';
          return (
            <div className="mt-4 text-xs opacity-90">
              <span className="mr-2">Popular:</span>
              {popular.map(q => (
                <Link
                  key={q}
                  href={`${basePath}?q=${encodeURIComponent(q)}`}
                  className="mr-2 inline-block rounded-full bg-white/20 px-3 py-1 text-white hover:bg-white/30"
                >
                  {q}
                </Link>
              ))}
            </div>
          );
        })()}
      </div>
    </section>
  );
}
