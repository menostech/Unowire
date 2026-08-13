'use client';

import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect, type FormEvent } from 'react';

type Category = 'cable' | 'equipment' | 'connectivity';

const CATEGORY_OPTIONS: { value: Category; label: string; code: string; placeholder: string; path: string }[] = [
  { value: 'cable',    label: 'Cable',      code: '01', placeholder: 'UL1007, AVSS…',           path: '/cables' },
  { value: 'equipment', label: 'Equipments', code: '02', placeholder: 'Komax, Alpha 488…',      path: '/equipment' },
  { value: 'connectivity', label: 'Connectivity',   code: '03', placeholder: 'Search connectivity model, brand…',  path: '/connectivity' },
];

export function SearchBox() {
  const router = useRouter();
  const [category, setCategory] = useState<Category>('cable');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const current = CATEGORY_OPTIONS.find(o => o.value === category)!;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const query = q.trim();
    router.push(query ? `${current.path}?q=${encodeURIComponent(query)}` : current.path);
  }

  // Close dropdown on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', onClick);
      return () => document.removeEventListener('mousedown', onClick);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <form onSubmit={handleSubmit} className="relative">
      {/* Custom category dropdown trigger — width ×1.6 (was w-[6rem] → w-[9.6rem]) */}
      <div ref={wrapRef} className="absolute left-1.5 top-1/2 -translate-y-1/2 z-10">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Search category"
          className="flex h-7 w-[9.6rem] items-center gap-1.5 border-0 bg-transparent px-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition hover:text-foreground focus:outline-none cursor-pointer"
        >
          <span className="text-muted-foreground/40">{current.code}</span>
          <span className="text-foreground/80">{current.label}</span>
          <svg
            className={`ml-auto size-3 text-muted-foreground/50 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown panel — industrial styled */}
        {open && (
          <div
            role="listbox"
            className="absolute left-0 top-full z-50 mt-1 min-w-[9.6rem] overflow-hidden rounded-md border border-border bg-popover shadow-lg shadow-black/5"
          >
            {/* Tiny header strip */}
            <div className="mono-label border-b border-border/60 bg-secondary/40 px-2.5 py-1 text-muted-foreground/50">
              CATEGORY
            </div>
            <ul className="p-0.5">
              {CATEGORY_OPTIONS.map(opt => {
                const isActive = opt.value === category;
                return (
                  <li key={opt.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => {
                        setCategory(opt.value);
                        setOpen(false);
                      }}
                      className={`group flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left font-mono text-[12px] uppercase tracking-wider transition ${
                        isActive
                          ? 'bg-secondary text-foreground'
                          : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                      }`}
                    >
                      <span className="text-muted-foreground/40 group-hover:text-primary">
                        {opt.code}
                      </span>
                      <span>{opt.label}</span>
                      {/* Active marker — amber dot */}
                      <span
                        className={`ml-auto size-1.5 rounded-full transition ${
                          isActive ? 'bg-primary' : 'bg-transparent'
                        }`}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Divider — shifted to match new width */}
      <div className="absolute left-[11rem] top-1/2 h-5 w-px -translate-y-1/2 bg-border" aria-hidden="true" />
      <input
        type="text"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={current.placeholder}
        className="w-full h-9 pl-[11.5rem] pr-9 rounded-md border border-input bg-secondary/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary focus:bg-card transition"
      />
      <button
        type="submit"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition"
        aria-label="Search"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </button>
    </form>
  );
}