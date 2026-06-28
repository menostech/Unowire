import { api } from '@/lib/api';
import { recommendEquipments } from '@/lib/equipment-recommend';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ brand_slug: string; slug: string }> }
) {
  const { brand_slug, slug } = await params;
  const cable = api.cables.getByUrl(brand_slug, slug);
  if (!cable) {
    return Response.json(
      { error: { code: "not_found", message: "Cable not found" } },
      { status: 404 }
    );
  }

  const brand = api.brands.getById(cable.brand_id);
  const manufacturer = brand ? api.manufacturers.getById(brand.manufacturer_id) : null;
  const categories = api.categories.getByIds(cable.category_ids);
  const recommended = recommendEquipments(cable, api.recommendedEquipments.all());

  return Response.json({
    cable,
    brand,
    manufacturer,
    categories,
    recommended_equipments: recommended,
  });
}
