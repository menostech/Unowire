import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ scopeType: string }> }
) {
  const { scopeType } = await params;
  const token = _request.cookies.get('admin_token')?.value;
  const res = await fetch(`${API_BASE}/api/admin/users/scopes/${encodeURIComponent(scopeType)}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
