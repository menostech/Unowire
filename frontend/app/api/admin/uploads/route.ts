import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

// POST /api/admin/uploads — multipart upload proxy (forwards folder_id form field)
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

// GET /api/admin/uploads?page=&page_size=&folder_id= — list uploads proxy
export async function GET(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  const { searchParams } = new URL(request.url);
  const page = searchParams.get('page') ?? '1';
  const page_size = searchParams.get('page_size') ?? '20';
  const folder_id = searchParams.get('folder_id');  // 'none' | number | null

  const backendUrl = new URL(`${API_BASE}/api/uploads`);
  backendUrl.searchParams.set('page', page);
  backendUrl.searchParams.set('page_size', page_size);
  if (folder_id !== null) {
    backendUrl.searchParams.set('folder_id', folder_id);
  }

  const res = await fetch(backendUrl.toString(), {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
