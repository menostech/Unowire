import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { PlanForm } from '@/components/admin/form/PlanForm';

interface PageProps {
  searchParams: Promise<{ new?: string; edit?: string }>;
}

export default async function PlansPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const plans = await adminApi.plans.list();

  if (sp.new === '1') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">New Plan</h1>
          <p className="mt-1 text-sm text-gray-500">Create a new subscription plan.</p>
        </div>
        <PlanForm mode="create" />
      </div>
    );
  }

  const editId = sp.edit ? Number(sp.edit) : null;
  if (editId !== null && !Number.isNaN(editId)) {
    const plan = plans.find((item) => item.id === editId);
    if (plan) {
      return (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Edit Plan</h1>
            <p className="mt-1 text-sm text-gray-500">
              {plan.name} ({plan.tier_level})
            </p>
          </div>
          <PlanForm mode="edit" initialData={plan} />
        </div>
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Plans</h1>
        <Link
          href="/admin/settings/plans?new=1"
          className="rounded-md bg-accent-foreground px-4 py-2 text-sm font-medium text-background hover:brightness-95"
        >
          New Plan
        </Link>
      </div>
      <div className="overflow-hidden rounded-md border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-left font-medium">Tier</th>
              <th className="px-4 py-2 text-left font-medium">Monthly</th>
              <th className="px-4 py-2 text-left font-medium">Yearly</th>
              <th className="px-4 py-2 text-left font-medium">Limits (S/D/M)</th>
              <th className="px-4 py-2 text-left font-medium">Trial</th>
              <th className="px-4 py-2 text-left font-medium">Sort</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {plans.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-gray-500" colSpan={9}>
                  No plans yet.
                </td>
              </tr>
            )}
            {plans.map((p) => (
              <tr key={p.id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium">{p.name}</td>
                <td className="px-4 py-2 font-mono text-xs">{p.tier_level}</td>
                <td className="px-4 py-2">{p.price_monthly}</td>
                <td className="px-4 py-2">{p.price_yearly}</td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {p.search_limit_daily}/{p.detail_view_limit_daily}/{p.download_limit_monthly}
                </td>
                <td className="px-4 py-2">{p.trial_days}d</td>
                <td className="px-4 py-2">{p.sort_order}</td>
                <td className="px-4 py-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {p.is_active ? 'Active' : 'Inactive'}
                  </span>
                  {p.is_sales_led && <span className="ml-1 text-xs text-gray-400">sales-led</span>}
                </td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={`/admin/settings/plans?edit=${p.id}`}
                    className="text-accent-foreground hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}