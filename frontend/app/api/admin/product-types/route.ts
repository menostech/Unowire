import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  const { industry_id, category_id, ...payload } = body;
  if (!industry_id || !category_id) {
    return NextResponse.json({ code: 400, message: 'industry_id and category_id are required' }, { status: 400 });
  }
  // Split composite category_id "industry/category" into path segments
  const catSegments = category_id.split('/');
  if (catSegments.length < 2) {
    return NextResponse.json({ code: 400, message: 'Invalid category_id format' }, { status: 400 });
  }
  const [indSlug, catSlug] = catSegments;
  const res = await fetch(`${API_BASE}/api/industries/${encodeURIComponent(indSlug)}/categories/${encodeURIComponent(catSlug)}/product-types`, {
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
