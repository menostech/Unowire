import Link from 'next/link';
import { portalApi } from '@/lib/portalApi';
import type { PortalEquipment } from '@/lib/types/portal';

export default async function PortalEquipmentPage() {
  let equipment: PortalEquipment[] = [];
  try {
    equipment = await portalApi.equipment.all();
  } catch {
    // empty state
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Equipment</h1>
        <Link
          href="/portal/equipment/new"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Equipment
        </Link>
      </div>
      {equipment.length === 0 ? (
        <p className="empty-state text-sm text-gray-500">No equipment in your scope yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {equipment.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/portal/equipment/${e.id}`} className="text-blue-600 hover:underline">
                      {e.model || e.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{e.category?.label ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {e.created_at ? new Date(e.created_at).toLocaleDateString() : '—'}
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
