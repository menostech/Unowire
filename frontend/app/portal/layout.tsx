import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { portalApi } from '@/lib/portalApi';
import { PortalSidebar } from '@/components/portal/layout/PortalSidebar';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [user, perms] = await Promise.all([
    portalApi.auth.me(),
    portalApi.auth.permissions(),
  ]);
  const pathname = (await headers()).get('x-pathname') || '';

  if (!user && pathname !== '/portal/login') {
    redirect(`/portal/login?from=${encodeURIComponent(pathname)}`);
  }
  if (!user) {
    return <>{children}</>; // login page renders without sidebar
  }

  return (
    <div className="portal-shell flex min-h-screen">
      <PortalSidebar
        user={user}
        allowedModules={perms?.allowed_modules ?? []}
      />
      <div className="flex flex-1 flex-col">
        <main className="flex-1 bg-gray-50 p-6">{children}</main>
      </div>
    </div>
  );
}
