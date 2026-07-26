import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('portal_token')?.value;
  const searchParams = req.nextUrl.searchParams;
  const queryString = searchParams.toString();
  const res = await fetch(
    `${API_BASE}/api/portal/messages${queryString ? `?${queryString}` : ''}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
