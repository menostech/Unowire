import { cookies } from 'next/headers';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

// GET: fetch a single portal resource by id (ownership checked on the backend).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get('portal_token')?.value;
  if (!token) {
    return new Response(JSON.stringify({ code: 401, message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const res = await fetch(`${API_BASE}/api/portal/resources/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// PUT: forward multipart FormData; do NOT set Content-Type so fetch attaches the boundary.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get('portal_token')?.value;
  if (!token) {
    return new Response(JSON.stringify({ code: 401, message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const formData = await request.formData();
  const res = await fetch(`${API_BASE}/api/portal/resources/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// DELETE: remove a portal resource (ownership checked on the backend).
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get('portal_token')?.value;
  if (!token) {
    return new Response(JSON.stringify({ code: 401, message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const res = await fetch(`${API_BASE}/api/portal/resources/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 204) {
    return new Response(null, { status: 204 });
  }
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
