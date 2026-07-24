import { cookies } from 'next/headers';
import { portalApi } from '@/lib/portalApi';
import { PortalSidebar } from '@/components/portal/layout/PortalSidebar';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // me() reads portal_token cookie; returns null if no token or invalid.
  // Login page renders without sidebar when no token; middleware handles
  // redirecting unauthenticated users away from protected pages.
  const user = await portalApi.auth.me();

  if (!user) {
    return <>{children}</>;
  }

  return (
    <div className="portal-shell flex min-h-screen">
      <PortalSidebar
        user={{
          ...user,
          scope_type: user.scope_type as 'manufacturer' | 'equipment_manufacturer',
        }}
      />
      <div className="flex flex-1 flex-col">
        <main className="flex-1 bg-gray-50 p-6">{children}</main>
      </div>
    </div>
  );
}
