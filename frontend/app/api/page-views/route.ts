import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function POST(req: NextRequest) {
  const body = await req.json();
  // Forward client IP from x-forwarded-for header (set by Nginx)
  const xff = req.headers.get('x-forwarded-for');
  const res = await fetch(`${API_BASE}/api/page-views`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(xff ? { 'x-forwarded-for': xff } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
