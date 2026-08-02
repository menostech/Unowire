import { cookies } from 'next/headers';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

// POST: forward multipart FormData to the backend admin resource create endpoint.
// Do NOT set Content-Type so fetch can attach the multipart boundary automatically.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  const formData = await request.formData();
  const res = await fetch(`${API_BASE}/api/resources/admin`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
