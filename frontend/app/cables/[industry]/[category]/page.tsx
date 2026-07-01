import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { ProductTypeCard } from '@/components/taxonomy/ProductTypeCard';
import { api } from '@/lib/api';
import { generateCategoryMetadata } from '@/lib/seo';
import type { TaxonomyIndustry, TaxonomyCategory } from '@/lib/types';

export async function generateMetadata({
  params,
}: { params: Promise<{ industry: string; category: string }> }): Promise<Metadata> {
  const { industry: industrySlug, category: categorySlug } = await params;
  const industryKey = await api.taxonomy.industryKeyBySlug(industrySlug);
  if (!industryKey) return { title: 'Not Found' };
  const categoryKey = await api.taxonomy.categoryKeyBySlug(industryKey, categorySlug);
  if (!categoryKey) return { title: 'Not Found' };
  const industry = (await api.taxonomy.industry(industryKey))!;
  const category = (await api.taxonomy.category(industryKey, categoryKey))!;
  return generateCategoryMetadata(industry, category);
}

export default async function CategoryPage({
  params,
}: { params: Promise<{ industry: string; category: string }> }) {
  const { industry: industrySlug, category: categorySlug } = await params;
  const industryKey = await api.taxonomy.industryKeyBySlug(industrySlug);
  if (!industryKey) notFound();
  const categoryKey = await api.taxonomy.categoryKeyBySlug(industryKey, categorySlug);
  if (!categoryKey) notFound();
  const industry = (await api.taxonomy.industry(industryKey))!;
  const category = (await api.taxonomy.category(industryKey, categoryKey))!;

  const allCables = await api.cables.all();
  const productTypes = Object.entries(category.product_types).map(([key, pt]) => {
    const cableCount = allCables.filter(c =>
      c.industry === industryKey && c.category === categoryKey && c.product_type === key
    ).length;
    return { productTypeKey: key, productType: pt, cableCount };
  });

  return (
    <Container className="py-6">
      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Cables', url: '/cables' },
        { name: industry.label, url: `/cables/${industrySlug}` },
        { name: category.label },
      ]} />

      <h1 className="text-2xl font-bold mb-6">{category.label}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {productTypes.map(pt => (
          <ProductTypeCard
            key={pt.productTypeKey}
            industry={industry}
            category={category}
            productType={pt.productType}
            cableCount={pt.cableCount}
          />
        ))}
      </div>
    </Container>
  );
}
