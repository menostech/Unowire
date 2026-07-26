import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('portal_token')?.value;
  if (!token) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
  }
  const res = await fetch(`${API_BASE}/api/portal/cables/import/json-example`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const blob = await res.blob();
  const headers = new Headers();
  headers.set('Content-Type', res.headers.get('Content-Type') ?? 'application/json');
  const cd = res.headers.get('Content-Disposition');
  if (cd) headers.set('Content-Disposition', cd);
  return new NextResponse(blob, { status: res.status, headers });
}
