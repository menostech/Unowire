'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Role, ScopeOption, AdminUserExtended } from '@/lib/types';

interface UserFormProps {
  mode: 'create' | 'edit';
  initialData?: AdminUserExtended;
  roles: Role[];
}

export function UserForm({ mode, initialData, roles }: UserFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState(initialData?.email ?? '');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState(initialData?.role_id ?? roles[0]?.id ?? '');
  const [scopeId, setScopeId] = useState(initialData?.scope_id ?? '');
  const [isActive, setIsActive] = useState(initialData?.is_active ?? true);
  const [scopes, setScopes] = useState<ScopeOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRole = roles.find((r) => r.id === roleId);
  const needsScope = selectedRole?.scope_type != null;

  useEffect(() => {
    if (needsScope && selectedRole?.scope_type) {
      fetch(`/api/admin/users/scopes/${encodeURIComponent(selectedRole.scope_type)}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data: ScopeOption[]) => setScopes(data))
        .catch(() => setScopes([]));
    } else {
      setScopes([]);
      setScopeId('');
    }
  }, [needsScope, selectedRole]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {
      email,
      role_id: roleId,
      scope_id: needsScope ? (scopeId || null) : null,
      is_active: isActive,
    };
    if (password) {
      payload.password = password;
    }
    try {
      const res = await fetch(
        mode === 'create' ? '/api/admin/users' : `/api/admin/users/${initialData!.id}`,
        {
          method: mode === 'create' ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed (${res.status})`);
      }
      router.push('/admin/users');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Password {mode === 'edit' && '(leave blank to keep current)'}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={mode === 'create'}
            minLength={8}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Role</label>
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} {r.scope_type ? `(${r.scope_type})` : ''}
              </option>
            ))}
          </select>
        </div>
        {needsScope && (
          <div>
            <label className="mb-1 block text-sm font-medium">
              Scope ({selectedRole?.scope_type})
            </label>
            <select
              value={scopeId}
              onChange={(e) => setScopeId(e.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground"
            >
              <option value="">— Select —</option>
              {scopes.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded"
            />
            Active
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-accent-foreground px-4 py-2 text-sm font-medium text-background hover:brightness-95 disabled:opacity-50"
        >
          {saving ? 'Saving...' : mode === 'create' ? 'Create User' : 'Save Changes'}
        </button>
        <Link
          href="/admin/users"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
