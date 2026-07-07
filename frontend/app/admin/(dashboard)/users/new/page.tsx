import { adminApi } from '@/lib/adminApi';
import { UserForm } from '@/components/admin/form/UserForm';

export default async function NewUserPage() {
  const roles = await adminApi.roles.all();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">New User</h1>
      <UserForm mode="create" roles={roles} />
    </div>
  );
}
