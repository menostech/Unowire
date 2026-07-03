import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

// POST /api/admin/uploads — multipart upload proxy (reads cookie, forwards as Bearer)
export async function POST(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  const formData = await request.formData();
  const res = await fetch(`${API_BASE}/api/uploads`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

// GET /api/admin/uploads?page=&page_size= — list uploads proxy
export async function GET(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  const { searchParams } = new URL(request.url);
  const page = searchParams.get('page') ?? '1';
  const page_size = searchParams.get('page_size') ?? '20';
  const res = await fetch(
    `${API_BASE}/api/uploads?page=${page}&page_size=${page_size}`,
    {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: 'no-store',
    }
  );
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
