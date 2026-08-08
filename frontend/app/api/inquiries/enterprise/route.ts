import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function POST(req: NextRequest) {
  const cookie = req.headers.get('cookie') || '';
  const body = await req.json();
  const res = await fetch(`${API_BASE}/api/inquiries/enterprise`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
