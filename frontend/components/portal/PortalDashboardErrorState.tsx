'use client';

import { useRouter } from 'next/navigation';

export function PortalDashboardErrorState() {
  const router = useRouter();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      </div>
      <div className="rounded-lg bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-gray-600">Failed to load dashboard data</p>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="mt-4 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
