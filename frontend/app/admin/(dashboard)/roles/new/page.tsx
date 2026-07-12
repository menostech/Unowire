import { RoleForm } from '@/components/admin/form/RoleForm';

export default function NewRolePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">New Role</h1>
      <RoleForm mode="create" />
    </div>
  );
}
