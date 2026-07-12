import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

async function fetchWithRetry(url: string, init: RequestInit, retries = 1): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      const isTransient = err instanceof TypeError && err.cause instanceof Error &&
        (/ECONNREFUSED|ECONNRESET|SocketError|other side closed/i.test(err.cause.message));
      if (isTransient && attempt < retries) continue;
      throw err;
    }
  }
  throw new Error('unreachable');
}

// POST /api/admin/uploads — multipart upload proxy (forwards folder_id form field)
export async function POST(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  const formData = await request.formData();
  try {
    const res = await fetchWithRetry(`${API_BASE}/api/uploads/`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ code: 502, message: 'Backend unavailable' }, { status: 502 });
  }
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

  try {
    const res = await fetchWithRetry(backendUrl.toString(), {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ code: 502, message: 'Backend unavailable' }, { status: 502 });
  }
}
