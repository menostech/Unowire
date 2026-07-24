import { api } from '@/lib/api';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ brand_slug: string; slug: string }> }
) {
  const { brand_slug, slug } = await params;
  const detail = await api.getCableDetail(brand_slug, slug);
  if (!detail) {
    return Response.json(
      { error: { code: "not_found", message: "Cable not found" } },
      { status: 404 }
    );
  }

  return Response.json(detail);
}
