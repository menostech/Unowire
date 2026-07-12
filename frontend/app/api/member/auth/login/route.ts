import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await fetch(`${API_BASE}/api/member/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }
  // Extract token from Set-Cookie header (backend sets member_token cookie)
  const setCookie = res.headers.get('set-cookie') || '';
  const tokenMatch = setCookie.match(/member_token=([^;]+)/);
  const token = tokenMatch ? tokenMatch[1] : '';
  const response = NextResponse.json({ member: data.member });
  response.cookies.set('member_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 28800,
    path: '/',
  });
  return response;
}
