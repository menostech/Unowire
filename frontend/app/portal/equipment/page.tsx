import Link from 'next/link';
import { portalApi } from '@/lib/portalApi';

export default async function PortalEquipmentPage() {
  let equipment: any[] = [];
  try {
    equipment = await portalApi.equipment.all();
  } catch {
    // empty state
  }
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Equipment</h1>
      {equipment.length === 0 ? (
        <p className="text-sm text-gray-500">No equipment in your scope yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
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
