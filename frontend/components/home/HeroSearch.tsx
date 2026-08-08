'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';

type TabKey = 'cable' | 'equipment' | 'terminal' | 'resources';

const TABS: { key: TabKey; label: string; code: string; placeholder: string; action: string }[] = [
  {
    key: 'cable',
    label: 'Cable',
    code: '01',
    placeholder: 'Search cable model, e.g. UL1007, AVSS...',
    action: '/cables',
  },
  {
    key: 'equipment',
    label: 'Equipment',
    code: '02',
    placeholder: 'Search equipment model or manufacturer...',
    action: '/equipment',
  },
  {
    key: 'terminal',
    label: 'Terminal',
    code: '03',
    placeholder: 'Search terminal model or manufacturer...',
    action: '/terminals',
  },
];

const POPULAR_SEARCHES: Record<TabKey, string[]> = {
  cable: ['UL1007', 'AVSS', 'UL1015', 'UL2468'],
  equipment: ['Komax', 'Alpha 488', 'Gamma 333', 'KMV'],
  terminal: ['Ring Terminal', 'Butt Connector', 'Spade Terminal', 'Pin Terminal'],
  resources: ['Installation Guide', 'Datasheet', 'CAD Drawing', 'Manual'],
};

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
    <section className="relative overflow-hidden bg-foreground text-background">
      {/* Engineering grid background */}
      <div className="absolute inset-0 opacity-[0.07]" style={{
        backgroundImage:
          'linear-gradient(oklch(0.985 0.004 80) 1px, transparent 1px), linear-gradient(90deg, oklch(0.985 0.004 80) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />
      {/* Amber glow accent — top right */}
      <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full opacity-20 blur-3xl" style={{ background: 'oklch(0.705 0.165 65)' }} />
      {/* Deep copper accent — bottom left, same family as amber primary */}
      <div className="absolute -left-40 bottom-0 h-80 w-80 rounded-full opacity-10 blur-3xl" style={{ background: 'oklch(0.5 0.13 50)' }} />

      <div className="relative">
        {/* Asymmetric layout: left annotation column + main content */}
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Left annotation column — technical sidebar */}
          <aside className="hidden lg:flex lg:col-span-2 flex-col justify-between border-r border-background/10 p-8">
            <div>
              <div className="mono-label text-background/50">
                INDEX / 001
              </div>
              <div className="mt-2 h-px w-12 bg-primary" />
            </div>
            <div className="space-y-3">
              <div className="mono-label text-background/40">CROSS-REF</div>
              <div className="font-mono text-[11px] leading-relaxed text-background/60">
                IEC 60228<br/>
                UL 758<br/>
                SAE J1128
              </div>
            </div>
          </aside>

          {/* Main hero content */}
          <div className="lg:col-span-10 px-8 md:px-12 py-20 md:py-28">
            <div className="mx-auto max-w-3xl">
              {/* Section label */}
              <div className="mb-6 flex items-center gap-3">
                <span className="h-px w-8 bg-primary" />
                <span className="mono-label text-primary">
                  SPECS DATABASE
                </span>
              </div>

              {/* Headline — bold typographic hierarchy */}
              <h1
                className="mb-5 text-4xl md:text-6xl font-bold leading-[1.05] tracking-tight"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                Cable, equipment
                <br />
                <span className="text-primary">&amp;</span> terminal
                <br />
                specifications.
              </h1>

              <p className="mb-10 max-w-xl text-base md:text-lg text-background/60 leading-relaxed">
                The engineering reference for wire, cable, equipment, and terminal specs.
                Query by model, manufacturer, or technical parameter.
              </p>

              {/* Search panel */}
              <div className="rounded-lg border border-background/15 bg-background/[0.03] p-1.5 backdrop-blur-sm">
                {/* Tabs — numbered technical switcher */}
                <div className="mb-1.5 flex gap-1" role="tablist" aria-label="Search target">
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
                          'group flex flex-1 items-center gap-2.5 rounded-md px-4 py-2.5 text-sm font-medium transition ' +
                          (isActive
                            ? 'bg-background text-foreground'
                            : 'text-background/60 hover:text-background hover:bg-background/10')
                        }
                      >
                        <span className="font-mono text-[11px] opacity-50">
                          {tab.code}
                        </span>
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* Search bar */}
                <form onSubmit={handleSubmit} className="flex items-center gap-2 rounded-md bg-background p-2">
                  <label htmlFor="hero-search" className="sr-only">
                    Search {currentTab.label.toLowerCase()}
                  </label>
                  <div className="flex flex-1 items-center gap-2.5 pl-3">
                    <span className="font-mono text-xs text-muted-foreground/60">
                      {currentTab.code}/
                    </span>
                    <input
                      id="hero-search"
                      type="text"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder={currentTab.placeholder}
                      className="flex-1 border-0 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                    />
                  </div>
                  <button
                    type="submit"
                    className="shrink-0 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-95"
                  >
                    Search
                  </button>
                </form>
              </div>

              {/* Popular searches — mono tags */}
              {(() => {
                const popular = POPULAR_SEARCHES[activeTab];
                const basePath = currentTab.action;
                return (
                  <div className="mt-6 flex flex-wrap items-center gap-2">
                    <span className="mono-label text-background/40">POPULAR /</span>
                    {popular.map(q => (
                      <Link
                        key={q}
                        href={`${basePath}?q=${encodeURIComponent(q)}`}
                        className="font-mono text-[12px] text-background/70 transition hover:text-primary"
                      >
                        {q}
                      </Link>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
