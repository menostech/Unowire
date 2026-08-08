import { notFound } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { EnterpriseSubscriptionForm } from '@/components/admin/form/EnterpriseSubscriptionForm';

export default async function MemberSubscriptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const memberId = parseInt(id);
  const member = await adminApi.members.getById(memberId);
  if (!member) notFound();

  // Fetch all subscriptions and filter to this member.
  const allSubs = await adminApi.subscriptions.list().catch(() => [] as any[]);
  const memberSubs = allSubs.filter(
    (s: any) => s.member_id === memberId || s.member?.id === memberId
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/members/${memberId}`}
          className="text-sm text-accent-foreground hover:underline"
        >
          ← Back to member
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Enterprise Subscription: {member.email}</h1>
      </div>

      <div className="border-t pt-6">
        <h2 className="mb-4 text-lg font-semibold">Current Subscriptions</h2>
        {memberSubs.length === 0 ? (
          <p className="text-sm text-gray-500">No subscriptions yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">ID</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Plan</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Period End</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {memberSubs.map((s: any) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 text-gray-600">#{s.id}</td>
                    <td className="px-4 py-3 text-gray-600">{s.plan ?? s.plan_key ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          s.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {s.status ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {s.period_end ? new Date(s.period_end).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="border-t pt-6">
        <h2 className="mb-1 text-lg font-semibold">Create Enterprise Subscription</h2>
        <p className="mb-4 text-sm text-gray-500">
          Grant this member an enterprise subscription by setting the period end date.
        </p>
        <EnterpriseSubscriptionForm memberId={memberId} />
      </div>
    </div>
  );
}