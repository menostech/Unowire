'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface ClaimRequestWithManufacturer {
  id: string;
  manufacturer_type: string;
  manufacturer_id: string;
  manufacturer_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  proof_description: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function ClaimsListClient({
  initialClaims,
  currentStatus,
}: {
  initialClaims: ClaimRequestWithManufacturer[];
  currentStatus: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState('');

  async function handleAction(id: string, action: 'approve' | 'reject') {
    setActionError('');
    try {
      const res = await fetch(`/api/admin/claims/${id}/${action}`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(data.message || `Failed to ${action} claim`);
        return;
      }
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setActionError(`Network error: failed to ${action} claim`);
    }
  }

  function handleStatusChange(value: string) {
    const params = new URLSearchParams();
    if (value) params.set('status', value);
    const qs = params.toString();
    router.push(qs ? `/admin/claims?${qs}` : '/admin/claims');
  }

  return (
    <div>
      {/* Status filter */}
      <div className="mb-4 flex items-center gap-3">
        <label htmlFor="status-filter" className="text-sm font-medium text-gray-700">
          Filter by status:
        </label>
        <select
          id="status-filter"
          value={currentStatus}
          onChange={(e) => handleStatusChange(e.target.value)}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        {isPending && <span className="text-sm text-gray-500">Updating...</span>}
      </div>

      {actionError && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {/* Claims table */}
      {initialClaims.length === 0 ? (
        <div className="rounded border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          No claims found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Company</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Proof</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Created</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {initialClaims.map((claim) => (
                <tr key={claim.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {claim.manufacturer_name || '(deleted manufacturer)'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                      claim.manufacturer_type === 'cable'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {claim.manufacturer_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    <div>{claim.contact_name}</div>
                    <div className="text-xs text-gray-400">{claim.contact_email}</div>
                    {claim.contact_phone && <div className="text-xs text-gray-400">{claim.contact_phone}</div>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 max-w-xs">
                    <div className="truncate" title={claim.proof_description}>
                      {claim.proof_description}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                      claim.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-700'
                        : claim.status === 'approved'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                    }`}>
                      {claim.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(claim.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {claim.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleAction(claim.id, 'approve')}
                          className="rounded bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAction(claim.id, 'reject')}
                          className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
