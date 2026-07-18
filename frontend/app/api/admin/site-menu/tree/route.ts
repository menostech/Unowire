import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  const location = request.nextUrl.searchParams.get('location') || '';
  const res = await fetch(`${API_BASE}/api/admin/site-menu/tree?location=${location}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
