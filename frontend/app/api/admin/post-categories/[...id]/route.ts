import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

// The [...id] catch-all route yields params.id as an array. Join segments with
// "/" to reconstruct composite IDs (e.g. "parent/slug").
function resolveCompositeId(id: string[] | string): string {
  const segments = Array.isArray(id) ? id : [id];
  return segments.map((s) => decodeURIComponent(s)).join('/');
}

// GET: fetch a single post category by (possibly composite) id.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string[] | string }> }
) {
  const { id } = await params;
  const compositeId = resolveCompositeId(id);
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  const res = await fetch(`${API_BASE}/api/post-categories/${encodeURIComponent(compositeId)}`, {
    method: 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

// PUT: forward JSON to update a post category.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string[] | string }> }
) {
  const { id } = await params;
  const compositeId = resolveCompositeId(id);
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  const body = await request.json();
  const res = await fetch(`${API_BASE}/api/post-categories/${encodeURIComponent(compositeId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

// DELETE: remove a post category.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string[] | string }> }
) {
  const { id } = await params;
  const compositeId = resolveCompositeId(id);
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  const res = await fetch(`${API_BASE}/api/post-categories/${encodeURIComponent(compositeId)}`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
