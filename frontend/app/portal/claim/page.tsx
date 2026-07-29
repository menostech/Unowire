'use client';

import { useState, useCallback, useRef } from 'react';
import {
  searchManufacturers,
  submitClaim,
  type ManufacturerSearchResult,
  type ClaimRequestCreate,
} from '@/lib/api/claimApi';

type Phase = 'search' | 'form' | 'success';

export default function PortalClaimPage() {
  const [phase, setPhase] = useState<Phase>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ManufacturerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ManufacturerSearchResult | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [proofDescription, setProofDescription] = useState('');

  // Debounced search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setError('');
      try {
        const data = await searchManufacturers(value);
        setResults(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Search failed');
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  function handleSelectCompany(mfr: ManufacturerSearchResult) {
    setSelected(mfr);
    setPhase('form');
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setError('');
    try {
      const payload: ClaimRequestCreate = {
        manufacturer_type: selected.type,
        manufacturer_id: selected.id,
        contact_name: contactName,
        contact_email: contactEmail,
        contact_phone: contactPhone || undefined,
        proof_description: proofDescription,
      };
      await submitClaim(payload);
      setPhase('success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  function resetToSearch() {
    setPhase('search');
    setSelected(null);
    setQuery('');
    setResults([]);
    setError('');
    setContactName('');
    setContactEmail('');
    setContactPhone('');
    setProofDescription('');
  }

  function backToSearch() {
    setPhase('search');
    setError('');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-2xl rounded-lg bg-white p-8 shadow-md">
        {phase === 'search' && (
          <>
            <h1 className="mb-2 text-2xl font-bold text-gray-900">Claim Your Company</h1>
            <p className="mb-6 text-sm text-gray-500">
              Search for your company and submit a claim request. Our team will review and get back to you.
            </p>
            {error && (
              <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            <div className="mb-4">
              <input
                type="text"
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search by company name..."
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoComplete="off"
              />
            </div>
            {searching && (
              <div className="py-4 text-center text-sm text-gray-500">Searching...</div>
            )}
            {!searching && query.trim() && results.length === 0 && (
              <div className="py-4 text-center text-sm text-gray-500">
                No companies found. Try a different search.
              </div>
            )}
            {results.length > 0 && (
              <ul className="divide-y divide-gray-200 rounded border border-gray-200">
                {results.map((mfr) => (
                  <li
                    key={`${mfr.type}-${mfr.id}`}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-900">{mfr.name}</span>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          mfr.type === 'cable'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {mfr.type}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectCompany(mfr)}
                      className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      Claim This Company
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {phase === 'form' && selected && (
          <>
            <h1 className="mb-2 text-2xl font-bold text-gray-900">Claim Your Company</h1>
            <p className="mb-6 text-sm text-gray-500">
              Fill out the form below to submit your claim request.
            </p>
            <div className="mb-4 rounded border border-gray-200 bg-gray-50 px-4 py-3">
              <span className="text-xs font-medium uppercase text-gray-500">Claiming</span>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-base font-semibold text-gray-900">{selected.name}</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    selected.type === 'cable'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-green-100 text-green-700'
                  }`}
                >
                  {selected.type}
                </span>
              </div>
            </div>
            {error && (
              <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="contact_name" className="mb-1 block text-sm font-medium text-gray-700">
                  Contact Name
                </label>
                <input
                  id="contact_name"
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="contact_email" className="mb-1 block text-sm font-medium text-gray-700">
                  Contact Email
                </label>
                <input
                  id="contact_email"
                  type="email"
                  required
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoComplete="email"
                />
              </div>
              <div>
                <label htmlFor="contact_phone" className="mb-1 block text-sm font-medium text-gray-700">
                  Contact Phone <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  id="contact_phone"
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoComplete="tel"
                />
              </div>
              <div>
                <label htmlFor="proof_description" className="mb-1 block text-sm font-medium text-gray-700">
                  Proof Description
                </label>
                <textarea
                  id="proof_description"
                  required
                  value={proofDescription}
                  onChange={(e) => setProofDescription(e.target.value)}
                  rows={4}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Describe how you are associated with this company and any proof you can provide (e.g., business email domain, official documents)."
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Claim'}
              </button>
            </form>
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={backToSearch}
                className="text-sm text-blue-600 hover:underline"
              >
                Back to search
              </button>
            </div>
          </>
        )}

        {phase === 'success' && (
          <>
            <h1 className="mb-2 text-2xl font-bold text-gray-900">Claim Submitted!</h1>
            <p className="mb-6 text-sm text-gray-500">
              Thank you. Your claim request has been submitted and will be reviewed by our team. We will
              contact you at the email you provided with next steps.
            </p>
            <button
              type="button"
              onClick={resetToSearch}
              className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Search for another company
            </button>
          </>
        )}
      </div>
    </div>
  );
}
