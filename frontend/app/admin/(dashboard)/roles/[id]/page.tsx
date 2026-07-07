import { notFound } from 'next/navigation';
import { adminApi } from '@/lib/adminApi';
import { RoleForm } from '@/components/admin/form/RoleForm';

export default async function EditRolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const role = await adminApi.roles.getById(id);
  if (!role) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Edit Role: {role.name}</h1>
      <RoleForm mode="edit" initialData={role} />
    </div>
  );
}
