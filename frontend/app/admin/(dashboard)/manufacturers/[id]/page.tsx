import { adminApi } from '@/lib/adminApi';
import { ManufacturerForm } from '@/components/admin/form/ManufacturerForm';
import { ManufacturerShowcaseBlocks } from '@/components/admin/form/ManufacturerShowcaseBlocks';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditManufacturerPage({ params }: PageProps) {
  const { id } = await params;
  const rawManufacturer = await adminApi.manufacturers.getRawById(id);
  const cablesResult = await adminApi.cables.all(1, 999);

  if (!rawManufacturer) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Not found</h1>
        <p className="text-gray-500">
          The manufacturer you are looking for does not exist.
        </p>
      </div>
    );
  }

  const manufacturer = {
    id: rawManufacturer.id,
    name: rawManufacturer.name,
    slug: rawManufacturer.slug,
    country: rawManufacturer.country ?? '',
    website: rawManufacturer.website ?? '',
    image_url: rawManufacturer.image_url ?? null,
    description: rawManufacturer.description ?? null,
    founded_year: rawManufacturer.founded_year ?? null,
    address: rawManufacturer.address ?? null,
    phone: rawManufacturer.phone ?? null,
    email: rawManufacturer.email ?? null,
    featured_cable_ids: rawManufacturer.featured_cable_ids ?? [],
    featured_image: rawManufacturer.featured_image ?? false,
    featured_image_sort: rawManufacturer.featured_image_sort ?? 0,
    featured_text: rawManufacturer.featured_text ?? false,
    featured_text_sort: rawManufacturer.featured_text_sort ?? 0,
  };

  const cables = cablesResult.items.map(c => ({
    id: c.id,
    model: c.model,
    manufacturer: c.manufacturer ? { name: c.manufacturer.name } : null,
  }));

  return (
    <div className="space-y-12">
      <div>
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Manufacturer</h1>
        <ManufacturerForm initial={manufacturer} />
      </div>
      <div>
        <h2 className="mb-4 text-xl font-bold text-gray-900">Showcase</h2>
        <ManufacturerShowcaseBlocks
          manufacturerId={id}
          initial={{
            description: rawManufacturer.description,
            founded_year: rawManufacturer.founded_year,
            address: rawManufacturer.address,
            phone: rawManufacturer.phone,
            email: rawManufacturer.email,
            featured_cable_ids: rawManufacturer.featured_cable_ids ?? [],
            featured_image: rawManufacturer.featured_image ?? false,
            featured_image_sort: rawManufacturer.featured_image_sort ?? 0,
            featured_text: rawManufacturer.featured_text ?? false,
            featured_text_sort: rawManufacturer.featured_text_sort ?? 0,
          }}
          cables={cables}
        />
      </div>
    </div>
  );
}
