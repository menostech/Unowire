import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';

export default async function RolesPage() {
  const roles = await adminApi.roles.all();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Roles</h1>
        <Link
          href="/admin/roles/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Role
        </Link>
      </div>
      <div className="overflow-hidden rounded-md border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium">ID</th>
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-left font-medium">Scope Type</th>
              <th className="px-4 py-2 text-left font-medium">Permissions</th>
              <th className="px-4 py-2 text-left font-medium">System</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-mono text-xs">{role.id}</td>
                <td className="px-4 py-2">{role.name}</td>
                <td className="px-4 py-2">{role.scope_type ?? '—'}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{role.permissions.length} modules</td>
                <td className="px-4 py-2">{role.is_system ? 'Yes' : 'No'}</td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={`/admin/roles/${role.id}`}
                    className="text-blue-600 hover:underline"
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
