'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ADMIN_MODULES, SCOPE_TYPE_LABELS } from '@/lib/adminModules';
import type { Role } from '@/lib/types';

interface RoleFormProps {
  mode: 'create' | 'edit';
  initialData?: Role;
}

export function RoleForm({ mode, initialData }: RoleFormProps) {
  const router = useRouter();
  const [id, setId] = useState(initialData?.id ?? '');
  const [name, setName] = useState(initialData?.name ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [scopeType, setScopeType] = useState<string | null>(initialData?.scope_type ?? null);
  const [sortOrder, setSortOrder] = useState(initialData?.sort_order ?? 0);
  const [permissions, setPermissions] = useState<Set<string>>(
    new Set(initialData?.permissions ?? [])
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSystem = initialData?.is_system ?? false;

  function togglePermission(moduleId: string) {
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        // Prevent removing protected modules from admin role
        if (isSystem && initialData?.id === 'admin' && ['users', 'menu_config', 'roles'].includes(moduleId)) {
          return prev;
        }
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      ...(mode === 'create' ? { id } : {}),
      name,
      description: description || null,
      scope_type: scopeType,
      sort_order: sortOrder,
      permissions: Array.from(permissions),
    };
    try {
      const res = await fetch(
        mode === 'create' ? '/api/admin/roles' : `/api/admin/roles/${initialData!.id}`,
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
      router.push('/admin/roles');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initialData || isSystem) return;
    if (!confirm(`Delete role "${initialData.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/roles/${initialData.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed (${res.status})`);
      }
      router.push('/admin/roles');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Role ID</label>
          {mode === 'create' ? (
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              required
              placeholder="e.g., viewer, cable_manager"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground"
            />
          ) : (
            <input
              type="text"
              value={id}
              disabled
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
            />
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Display Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Scope Type</label>
          <select
            value={scopeType ?? ''}
            onChange={(e) => setScopeType(e.target.value || null)}
            disabled={isSystem}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground"
          >
            <option value="">None (global role)</option>
            {Object.entries(SCOPE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          {isSystem && (
            <p className="mt-1 text-xs text-gray-500">System role — scope type cannot be changed.</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Sort Order</label>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
            className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground"
          />
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">Module Permissions</label>
        <div className="rounded-md border border-gray-200">
          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
            {ADMIN_MODULES.map((m) => {
              const checked = permissions.has(m.id);
              const isProtected = isSystem && initialData?.id === 'admin' && ['users', 'menu_config', 'roles'].includes(m.id);
              return (
                <label
                  key={m.id}
                  className={`flex items-center gap-2 rounded p-2 text-sm ${
                    checked ? 'bg-accent' : 'hover:bg-gray-50'
                  } ${isProtected ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePermission(m.id)}
                    disabled={isProtected}
                    className="rounded"
                  />
                  <span>{m.label}</span>
                  {m.scopeAware && (
                    <span className="text-xs text-gray-400">(scoped)</span>
                  )}
                </label>
              );
            })}
          </div>
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
          {saving ? 'Saving...' : mode === 'create' ? 'Create Role' : 'Save Changes'}
        </button>
        <Link
          href="/admin/roles"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </Link>
        {mode === 'edit' && !isSystem && (
          <button
            type="button"
            onClick={handleDelete}
            className="ml-auto rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
