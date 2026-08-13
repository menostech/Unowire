import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { JsonLd } from '@/components/seo/JsonLd';
import { ApplicableSpecsTable } from '@/components/terminals/ApplicableSpecsTable';
import { InquiryFormModal } from '@/components/member/InquiryFormModal';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const terminal = await findTerminalBySlug(slug);
  if (!terminal) return { title: 'Product Not Found' };
  const mfrName = terminal.manufacturer?.name ?? 'Unknown';
  return {
    title: `${terminal.model} - ${mfrName} | Unowire`,
    description: terminal.description?.slice(0, 160) ?? `Details and applicable specifications for ${terminal.model} by ${mfrName}.`,
  };
}

async function findTerminalBySlug(slug: string) {
  const all = await api.terminals.all();
  return all.find((t) => t.slug === slug) ?? null;
}

function buildProductJsonLd(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  terminal: any,
  manufacturerName: string,
  categoryName: string
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: terminal.model,
    image: terminal.image_url || undefined,
    description: terminal.description || undefined,
    category: categoryName,
    manufacturer: {
      '@type': 'Organization',
      name: manufacturerName,
    },
  };
}

function buildBreadcrumbJsonLd(model: string, manufacturerName: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
      { '@type': 'ListItem', position: 2, name: 'Connectivity Products', item: '/connectivity' },
      { '@type': 'ListItem', position: 3, name: `${model} - ${manufacturerName}` },
    ],
  };
}

export default async function TerminalDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const terminal = await findTerminalBySlug(slug);
  if (!terminal) notFound();

  const cookieStore = await cookies();
  const memberToken = cookieStore.get('member_token')?.value;

  const manufacturer = terminal.manufacturer;
  const category = terminal.category;
  const manufacturerName = manufacturer?.name ?? 'Unknown';
  const categoryName = category?.label ?? '';

  return (
    <Container className="py-8">
      <Breadcrumbs
        items={[
          { name: 'Home', url: '/' },
          { name: 'Connectivity Products', url: '/connectivity' },
          { name: terminal.model },
        ]}
      />

      <JsonLd
        data={[
          buildProductJsonLd(terminal, manufacturerName, categoryName),
          buildBreadcrumbJsonLd(terminal.model, manufacturerName),
        ]}
      />

      <div className="space-y-6">
        {/* Header block */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-gray-100">
            {terminal.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={terminal.image_url}
                alt={terminal.model}
                className="h-80 w-full object-cover"
              />
            ) : (
              <div className="flex h-80 w-full items-center justify-center text-gray-400">
                No image available
              </div>
            )}
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl font-bold text-gray-900">{terminal.model}</h1>
            {manufacturer && (
              <Link
                href={`/connectivity/manufacturers/${encodeURIComponent(manufacturer.slug)}`}
                className="block text-accent-foreground hover:underline"
              >
                {manufacturer.name}
              </Link>
            )}
            {category && (
              <Link
                href={`/connectivity?category=${encodeURIComponent(category.id)}#connectivity-list`}
                className="inline-block rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200"
              >
                {category.label}
              </Link>
            )}
            {terminal.external_url && (
              <a
                href={terminal.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
              >
                View Product →
              </a>
            )}
            {/* Inquiry CTA */}
            <div className="pt-2">
              {memberToken ? (
                manufacturer && (
                  <InquiryFormModal
                    recipientType="terminal_manufacturer"
                    recipientId={manufacturer.id}
                    manufacturerName={manufacturer.name}
                    defaultSubject={`Inquiry about ${terminal.model}`}
                  />
                )
              ) : (
                <Link
                  href={`/login?redirect=${encodeURIComponent(`/connectivity/${terminal.slug}`)}`}
                  className="inline-block text-sm text-accent-foreground hover:underline"
                >
                  Login to Inquire
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        {terminal.description && (
          <div>
            <h2 className="mb-2 text-xl font-semibold text-gray-900">Description</h2>
            <p className="text-gray-700 whitespace-pre-line">{terminal.description}</p>
          </div>
        )}

        {/* Applicable Specs Table */}
        <div>
          <h2 className="mb-2 text-xl font-semibold text-gray-900">Applicable Specifications</h2>
          <ApplicableSpecsTable specs={terminal.applicable_specs} />
        </div>
      </div>
    </Container>
  );
}

