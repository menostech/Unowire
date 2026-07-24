import { portalApi } from '@/lib/portalApi';

export default async function PortalMediaPage() {
  let folders: any[] = [];
  let uploads: { items: any[]; total: number } | null = null;
  try {
    [folders, uploads] = await Promise.all([
      portalApi.folders.all().catch(() => []),
      portalApi.uploads.all().catch(() => null),
    ]);
  } catch {
    // empty state
  }
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Media Library</h1>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Folders</h2>
          {folders.length === 0 ? (
            <p className="empty-state text-xs text-gray-500">No folders.</p>
          ) : (
            <ul className="space-y-1">
              {folders.map((f) => (
                <li key={f.id} className="text-sm text-gray-700">
                  {f.name} <span className="text-xs text-gray-400">({f.upload_count ?? 0})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="lg:col-span-2 rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">
            Uploads {uploads ? `(${uploads.total})` : ''}
          </h2>
          {!uploads || uploads.items.length === 0 ? (
            <p className="empty-state text-xs text-gray-500">No uploads.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {uploads.items.map((u) => (
                <a
                  key={u.id}
                  href={u.url_path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded border border-gray-200"
                >
                  {u.url_path && /\.(jpg|jpeg|png|gif|webp)$/i.test(u.url_path) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.url_path} alt={u.filename} className="h-20 w-full object-cover" />
                  ) : (
                    <div className="flex h-20 items-center justify-center bg-gray-50 text-xs text-gray-500">
                      {u.filename}
                    </div>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
