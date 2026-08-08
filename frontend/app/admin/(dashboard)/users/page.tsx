import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';

export default async function UsersPage() {
  const users = await adminApi.users.all();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Users</h1>
        <Link
          href="/admin/users/new"
          className="rounded-md bg-accent-foreground px-4 py-2 text-sm font-medium text-background hover:brightness-95"
        >
          New User
        </Link>
      </div>
      <div className="overflow-hidden rounded-md border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium">ID</th>
              <th className="px-4 py-2 text-left font-medium">Email</th>
              <th className="px-4 py-2 text-left font-medium">Role</th>
              <th className="px-4 py-2 text-left font-medium">Scope</th>
              <th className="px-4 py-2 text-left font-medium">Active</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-gray-100">
                <td className="px-4 py-2 text-xs text-gray-500">{user.id}</td>
                <td className="px-4 py-2">{user.email}</td>
                <td className="px-4 py-2">{user.role_name ?? user.role_id}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{user.scope_id ?? '—'}</td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${user.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    {user.is_active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td className="px-4 py-2 text-right space-x-3">
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="text-accent-foreground hover:underline"
                  >
                    Edit
                  </Link>
                  <Link
                    href={`/admin/messages/new?recipientType=targeted&recipientKind=user&recipientId=${user.id}&recipientLabel=${encodeURIComponent(user.email)}`}
                    className="text-accent-foreground hover:underline"
                  >
                    Message
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
