import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { portalApi } from '@/lib/portalApi';
import { PortalSidebar } from '@/components/portal/layout/PortalSidebar';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('portal_token')?.value;
  if (!token) {
    redirect('/portal/login');
  }
  const user = await portalApi.auth.me();
  if (!user) {
    redirect('/portal/login');
  }
  return (
    <div className="portal-shell flex min-h-screen">
      <PortalSidebar user={user} />
      <div className="flex flex-1 flex-col">
        <main className="flex-1 bg-gray-50 p-6">{children}</main>
      </div>
    </div>
  );
}
