'use client';

import { useState } from 'react';
import { portalApiClient, PortalApiError } from '@/lib/portalApiClient';

export function ChangePasswordForm() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!oldPassword) e.old_password = 'Current password is required';
    if (newPassword.length < 8) e.new_password = 'Password must be at least 8 characters';
    if (newPassword && newPassword === oldPassword) e.new_password = 'New password must differ from current password';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setMessage('');
    setErrors({});
    try {
      await portalApiClient.auth.changePassword(oldPassword, newPassword);
      setMessage('Password changed successfully');
      setOldPassword('');
      setNewPassword('');
    } catch (err) {
      if (err instanceof PortalApiError && err.fieldErrors) setErrors(err.fieldErrors);
      else if (err instanceof PortalApiError) setMessage(err.message);
      else setMessage('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-700">Change Password</h2>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Current Password</label>
        <input
          type="password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          required
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          autoComplete="current-password"
        />
        {errors.old_password && <p className="mt-1 text-sm text-red-600">{errors.old_password}</p>}
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">New Password</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          autoComplete="new-password"
        />
        <p className="mt-1 text-xs text-gray-400">Minimum 8 characters.</p>
        {errors.new_password && <p className="mt-1 text-sm text-red-600">{errors.new_password}</p>}
      </div>
      <button
        type="submit"
        disabled={saving}
        className="rounded bg-accent-foreground px-4 py-2 text-sm font-medium text-background hover:brightness-95 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Change Password'}
      </button>
      {message && <p className="text-sm text-gray-600">{message}</p>}
    </form>
  );
}
