import { portalApi } from '@/lib/portalApi';
import type { PortalUser } from '@/lib/types/portal';
import { ChangePasswordForm } from '@/components/portal/form/ChangePasswordForm';

export default async function PortalSettingsPage() {
  let me: PortalUser | null = null;
  try {
    me = await portalApi.auth.me();
  } catch {
    // ignore
  }
  return (
    <div className="max-w-xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Settings</h1>
      {me && (
        <div className="mb-6 rounded-lg bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-700"><strong>Email:</strong> {me.email}</p>
          <p className="text-sm text-gray-700"><strong>Role:</strong> {me.role_name}</p>
          <p className="text-sm text-gray-700"><strong>Scope:</strong> {me.scope_type} / {me.scope_id}</p>
        </div>
      )}
      <ChangePasswordForm />
    </div>
  );
}
