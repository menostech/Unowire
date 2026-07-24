import Link from 'next/link';
import { portalApi } from '@/lib/portalApi';

export default async function PortalCablesPage() {
  let cables: any[] = [];
  try {
    cables = await portalApi.cables.all();
  } catch {
    // empty state
  }
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Cables</h1>
      {cables.length === 0 ? (
        <p className="text-sm text-gray-500">No cables in your scope yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Manufacturer</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cables.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/portal/cables/${c.id}`} className="text-blue-600 hover:underline">
                      {c.model || c.slug || c.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.manufacturer?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
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
