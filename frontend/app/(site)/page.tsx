import type { Metadata } from 'next';
import { Container } from '@/components/layout/Container';
import { HeroSearch } from '@/components/home/HeroSearch';
import { StatsRow } from '@/components/home/StatsRow';
import { CableCategoryGrid } from '@/components/home/CableCategoryGrid';
import { EquipmentCategoryGrid } from '@/components/home/EquipmentCategoryGrid';
import { api } from '@/lib/api';
import { generateHomeMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return generateHomeMetadata();
}

export default async function HomePage() {
  const [
    cables,
    brands,
    taxonomy,
    equipmentTree,
    equipmentManufacturers,
    equipmentList,
  ] = await Promise.all([
    api.cables.all(),
    api.brands.all(),
    api.taxonomy.all(),
    api.equipmentCategories.tree(),
    api.equipmentManufacturers.all(),
    api.recommendedEquipments.all(),
  ]);

  const industryCount = Object.keys(taxonomy).length;

  return (
    <>
      <HeroSearch />
      <Container>
        <StatsRow
          cables={cables.length}
          brands={brands.length}
          industries={industryCount}
          equipment={equipmentList.length}
          manufacturers={equipmentManufacturers.length}
        />
        <CableCategoryGrid taxonomy={taxonomy} />
        <EquipmentCategoryGrid tree={equipmentTree} />
      </Container>
    </>
  );
}
