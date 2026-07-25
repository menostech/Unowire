import { portalApi } from '@/lib/portalApi';
import { MediaLibrary } from '@/components/portal/media/MediaLibrary';
import type { PortalFolder, PortalUploadPage } from '@/lib/types/portal';

export default async function PortalMediaPage() {
  const [folders, uploads] = await Promise.all([
    portalApi.folders.all().catch(() => [] as PortalFolder[]),
    portalApi.uploads.all({ page: 1, pageSize: 20 }).catch(
      () => ({ items: [], total: 0, page: 1, page_size: 20 }) as PortalUploadPage,
    ),
  ]);
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Media Library</h1>
      <MediaLibrary initialFolders={folders} initialUploads={uploads} />
    </div>
  );
}
