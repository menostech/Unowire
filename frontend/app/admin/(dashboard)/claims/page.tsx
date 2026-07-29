import { adminApi } from '@/lib/adminApi';
import { ClaimsListClient } from './ClaimsListClient';

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function AdminClaimsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const status = sp.status;
  const claims = await adminApi.claims.all(status);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Claims</h1>
      </div>
      <ClaimsListClient initialClaims={claims} currentStatus={status || ''} />
    </div>
  );
}
