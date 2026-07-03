import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  const { industry_id, ...payload } = body;
  if (!industry_id) {
    return NextResponse.json({ code: 400, message: 'industry_id is required' }, { status: 400 });
  }
  const res = await fetch(`${API_BASE}/api/industries/${encodeURIComponent(industry_id)}/categories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
