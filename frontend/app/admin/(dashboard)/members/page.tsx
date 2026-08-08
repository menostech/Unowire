import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; is_verified?: string; is_active?: string }>;
}) {
  const sp = await searchParams;
  const filters: { q?: string; is_verified?: boolean; is_active?: boolean } = {};
  if (sp.q) filters.q = sp.q;
  if (sp.is_verified === 'true') filters.is_verified = true;
  if (sp.is_verified === 'false') filters.is_verified = false;
  if (sp.is_active === 'true') filters.is_active = true;
  if (sp.is_active === 'false') filters.is_active = false;

  const members = await adminApi.members.all(filters);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Members</h1>
      </div>

      {/* Search and filters */}
      <form className="flex flex-wrap gap-3" method="GET">
        <input
          type="text"
          name="q"
          defaultValue={sp.q ?? ''}
          placeholder="Search email or name..."
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground"
        />
        <select
          name="is_verified"
          defaultValue={sp.is_verified ?? ''}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All (verified)</option>
          <option value="true">Verified</option>
          <option value="false">Unverified</option>
        </select>
        <select
          name="is_active"
          defaultValue={sp.is_active ?? ''}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All (active)</option>
          <option value="true">Active</option>
          <option value="false">Disabled</option>
        </select>
        <button
          type="submit"
          className="rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          Apply
        </button>
        <Link
          href="/admin/members"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Clear
        </Link>
      </form>

      {/* Members table */}
      <div className="overflow-hidden rounded-md border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium">ID</th>
              <th className="px-4 py-2 text-left font-medium">Email</th>
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-left font-medium">Company</th>
              <th className="px-4 py-2 text-left font-medium">Verified</th>
              <th className="px-4 py-2 text-left font-medium">Active</th>
              <th className="px-4 py-2 text-left font-medium">Inquiries</th>
              <th className="px-4 py-2 text-left font-medium">Created</th>
              <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                  No members found.
                </td>
              </tr>
            ) : (
              members.map((member) => (
                <tr key={member.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-xs text-gray-500">{member.id}</td>
                  <td className="px-4 py-2">{member.email}</td>
                  <td className="px-4 py-2">{member.name}</td>
                  <td className="px-4 py-2 text-gray-500">{member.company ?? '—'}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${member.is_verified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {member.is_verified ? 'Verified' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${member.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {member.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">{member.inquiry_count}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {new Date(member.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-right space-x-3">
                    <Link
                      href={`/admin/members/${member.id}`}
                      className="text-accent-foreground hover:underline"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/admin/messages/new?recipientType=targeted&recipientKind=member&recipientId=${member.id}&recipientLabel=${encodeURIComponent(member.email)}`}
                      className="text-accent-foreground hover:underline"
                    >
                      Message
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
