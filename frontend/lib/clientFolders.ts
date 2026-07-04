// Client-side folders module — safe to import from 'use client' components.

export interface Folder {
  id: number;
  name: string;
  parent_id: number | null;
  created_at: string;
  upload_count: number;
}

export interface FolderTreeResponse {
  folders: Folder[];
}

const BASE = '/api/admin/folders';

export async function listFolders(): Promise<Folder[]> {
  const res = await fetch(BASE, { cache: 'no-store' });
  if (!res.ok) throw new Error(`List folders failed: ${res.status}`);
  const data: FolderTreeResponse = await res.json();
  return data.folders;
}

export async function createFolder(name: string, parentId: number | null): Promise<Folder> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parent_id: parentId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Create folder failed: ${res.status}`);
  }
  return res.json();
}

export async function renameFolder(id: number, name: string): Promise<Folder> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Rename folder failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteFolder(id: number): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Delete folder failed: ${res.status}`);
  }
}

/**
 * Build a nested tree structure from a flat list of folders.
 * Children arrays are sorted by name.
 */
export interface FolderNode extends Folder {
  children: FolderNode[];
}

export function buildFolderTree(folders: Folder[]): FolderNode[] {
  const map = new Map<number, FolderNode>();
  folders.forEach((f) => map.set(f.id, { ...f, children: [] }));
  const roots: FolderNode[] = [];
  map.forEach((node) => {
    if (node.parent_id === null) {
      roots.push(node);
    } else {
      const parent = map.get(node.parent_id);
      if (parent) {
        parent.children.push(node);
      } else {
        // Orphan (parent deleted) — treat as root
        roots.push(node);
      }
    }
  });
  const sortRecursive = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortRecursive(n.children));
  };
  sortRecursive(roots);
  return roots;
}
