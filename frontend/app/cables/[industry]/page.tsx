import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CategoryCard } from '@/components/taxonomy/CategoryCard';
import { api } from '@/lib/api';
import { generateIndustryMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: { params: Promise<{ industry: string }> }): Promise<Metadata> {
  const { industry: industrySlug } = await params;
  const industryKey = await api.taxonomy.industryKeyBySlug(industrySlug);
  if (!industryKey) return { title: 'Not Found' };
  const industry = (await api.taxonomy.industry(industryKey))!;
  return generateIndustryMetadata(industry);
}

export default async function IndustryPage({ params }: { params: Promise<{ industry: string }> }) {
  const { industry: industrySlug } = await params;
  const industryKey = await api.taxonomy.industryKeyBySlug(industrySlug);
  if (!industryKey) notFound();
  const industry = (await api.taxonomy.industry(industryKey))!;

  const allCables = await api.cables.all();
  const categories = Object.entries(industry.categories).map(([key, cat]) => {
    const productTypeCount = Object.keys(cat.product_types).length;
    const cableCount = allCables.filter(c => c.industry === industryKey && c.category === key).length;
    return { categoryKey: key, category: cat, productTypeCount, cableCount };
  });

  return (
    <Container className="py-6">
      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Cables', url: '/cables' },
        { name: industry.label },
      ]} />

      <h1 className="text-2xl font-bold mb-1">{industry.label}</h1>
      <p className="text-sm text-gray-600 mb-6">{industry.description}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map(c => (
          <CategoryCard
            key={c.categoryKey}
            industry={industry}
            category={c.category}
            productTypeCount={c.productTypeCount}
            cableCount={c.cableCount}
          />
        ))}
      </div>
    </Container>
  );
}
