import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

// Helper: rebuild composite ID "industry/category" from catch-all segments,
// then split into path segments for the backend URL.
function splitCompositeId(id: string[] | string): string[] | null {
  const segments = Array.isArray(id) ? id : [id];
  const composite = segments.map((s) => decodeURIComponent(s)).join('/');
  const parts = composite.split('/');
  if (parts.length < 2) return null;
  return parts;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string[] | string }> }
) {
  const { id } = await params;
  const parts = splitCompositeId(id);
  if (!parts) {
    return NextResponse.json({ code: 400, message: 'Invalid category ID' }, { status: 400 });
  }
  const [industryId, catSlug] = parts;
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  const res = await fetch(
    `${API_BASE}/api/industries/${encodeURIComponent(industryId)}/categories/${encodeURIComponent(catSlug)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }
  );
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string[] | string }> }
) {
  const { id } = await params;
  const parts = splitCompositeId(id);
  if (!parts) {
    return NextResponse.json({ code: 400, message: 'Invalid category ID' }, { status: 400 });
  }
  const [industryId, catSlug] = parts;
  const token = request.cookies.get('admin_token')?.value;
  const res = await fetch(
    `${API_BASE}/api/industries/${encodeURIComponent(industryId)}/categories/${encodeURIComponent(catSlug)}`,
    {
      method: 'DELETE',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }
  );
  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
