import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('portal_token')?.value;
  if (!token) {
    return NextResponse.json({ code: 401, message: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.text();
  const res = await fetch(`${API_BASE}/api/portal/terminals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body,
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
