import { redirect } from 'next/navigation';
import { portalApi } from '@/lib/portalApi';
import type { PortalDashboard } from '@/lib/types/portal';
import { PortalDashboardContent } from '@/components/portal/PortalDashboardContent';
import { PortalDashboardErrorState } from '@/components/portal/PortalDashboardErrorState';

export default async function PortalDashboardPage() {
  let data: PortalDashboard;
  try {
    data = await portalApi.dashboard.get();
  } catch {
    const user = await portalApi.auth.me();
    if (!user) redirect('/portal/login?from=/portal');
    return <PortalDashboardErrorState />;
  }
  return <PortalDashboardContent data={data} />;
}
