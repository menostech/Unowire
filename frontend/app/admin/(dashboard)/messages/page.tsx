import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { formatRecipientSummary } from '@/lib/utils/messages';

export default async function AdminMessagesPage() {
  const data = await adminApi.messages.all(1, 20);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Messages</h1>
        <Link
          href="/admin/messages/new"
          className="rounded-md bg-accent-foreground px-4 py-2 text-sm font-medium text-background hover:brightness-95"
        >
          New Message
        </Link>
      </div>

      {data.items.length === 0 ? (
        <p className="text-sm text-gray-500">
          No messages yet. Click &quot;New Message&quot; to broadcast.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">ID</th>
                <th className="px-4 py-2 text-left font-medium">Title</th>
                <th className="px-4 py-2 text-left font-medium">Recipients</th>
                <th className="px-4 py-2 text-left font-medium">Publisher</th>
                <th className="px-4 py-2 text-left font-medium">Created</th>
                <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.items.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3 text-gray-600">#{m.id}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/messages/${m.id}`}
                      className="text-accent-foreground hover:underline"
                    >
                      {m.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700 text-xs">
                    {formatRecipientSummary(m.recipient_targets, m.recipient_type)}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {m.created_by_email ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(m.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/messages/${m.id}`}
                      className="text-accent-foreground hover:underline text-sm"
                    >
                      View
                    </Link>
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
