import { notFound } from 'next/navigation';
import { adminApi } from '@/lib/adminApi';
import { UserForm } from '@/components/admin/form/UserForm';

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, roles] = await Promise.all([
    adminApi.users.getById(parseInt(id)),
    adminApi.roles.all(),
  ]);
  if (!user) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Edit User: {user.email}</h1>
      <UserForm mode="edit" initialData={user} roles={roles} />
    </div>
  );
}
