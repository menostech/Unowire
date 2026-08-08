import { NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function GET() {
  const res = await fetch(`${API_BASE}/api/plans`, { next: { revalidate: 60 } });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
