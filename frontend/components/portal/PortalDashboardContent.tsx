import type { PortalDashboard } from '@/lib/types/portal';
import { DashboardStats } from '@/components/portal/DashboardStats';
import { InquiryTrendChart } from '@/components/portal/InquiryTrendChart';
import { ViewsTrendChart } from '@/components/portal/ViewsTrendChart';
import { RecentInquiries } from '@/components/portal/RecentInquiries';

export function PortalDashboardContent({ data }: { data: PortalDashboard }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{data.factory_name}</h1>
        <p className="text-sm text-gray-500">Factory Portal Dashboard</p>
      </div>
      <DashboardStats stats={data.stats} scopeType={data.scope_type} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <InquiryTrendChart data={data.inquiry_trend} />
        <ViewsTrendChart data={data.views_trend} />
      </div>
      <RecentInquiries inquiries={data.recent_inquiries} />
    </div>
  );
}
