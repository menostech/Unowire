import { NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function POST() {
  const res = await fetch(`${API_BASE}/api/portal/auth/logout`, { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  const response = NextResponse.json(data, { status: res.status });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    response.headers.set('set-cookie', setCookie);
  }
  return response;
}
