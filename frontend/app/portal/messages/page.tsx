import Link from 'next/link';
import { portalApi } from '@/lib/portalApi';

export default async function PortalMessagesPage() {
  let items: { id: number; title: string; created_at: string; is_read: boolean }[] = [];
  try {
    const data = await portalApi.messages.all(1, 20);
    items = data.items;
  } catch {
    // empty state
  }
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Messages</h1>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">No messages yet.</p>
      ) : (
        <div className="space-y-3">
          {items.map((msg) => (
            <Link
              key={msg.id}
              href={`/portal/messages/${msg.id}`}
              className="block rounded-lg bg-white p-4 shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-sm ${
                    msg.is_read ? 'text-gray-700' : 'font-semibold text-gray-900'
                  }`}
                >
                  {msg.title}
                </span>
                <span className="text-xs text-gray-400">
                  {msg.created_at ? new Date(msg.created_at).toLocaleDateString() : ''}
                </span>
              </div>
              {!msg.is_read && (
                <span className="mt-1 inline-block rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                  New
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
