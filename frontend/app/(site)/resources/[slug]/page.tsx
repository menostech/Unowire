import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const resource = await api.resources.getBySlug(slug);
  if (!resource) return { title: 'Resource Not Found' };
  return {
    title: `${resource.title} | Unowire`,
    description: resource.description?.slice(0, 160) ?? `Download or view ${resource.title}.`,
  };
}

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExtension(filename: string | null | undefined): string {
  if (!filename) return 'FILE';
  const parts = filename.split('.');
  if (parts.length < 2) return 'FILE';
  return parts[parts.length - 1].toUpperCase();
}

export default async function ResourceDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const resource = await api.resources.getBySlug(slug);
  // getBySlug returns null if not found or not published.
  if (!resource) notFound();

  const category = resource.category;
  const hasFile = Boolean(resource.file_url_path && resource.file_filename);
  const hasExternal = Boolean(resource.external_url) && !hasFile;

  const breadcrumbItems = [
    { name: 'Home', url: '/' },
    { name: 'Resources', url: '/resources' },
  ];
  if (category) {
    breadcrumbItems.push({
      name: category.label,
      url: `/resources?category_id=${encodeURIComponent(category.id)}`,
    });
  }
  breadcrumbItems.push({ name: resource.title });

  return (
    <Container className="py-8">
      <Breadcrumbs items={breadcrumbItems} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="flex items-start gap-4">
              {/* File type icon */}
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-gray-100 text-sm font-bold text-gray-600">
                {fileExtension(resource.file_filename)}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold text-gray-900">{resource.title}</h1>
                {category && (
                  <Link
                    href={`/resources?category_id=${encodeURIComponent(category.id)}`}
                    className="mt-1 inline-block text-sm text-blue-600 hover:underline"
                  >
                    {category.label}
                  </Link>
                )}
              </div>
            </div>

            {resource.description && (
              <div className="mt-4">
                <h2 className="mb-1 text-sm font-semibold uppercase text-gray-500">Description</h2>
                <p className="whitespace-pre-line text-gray-700">{resource.description}</p>
              </div>
            )}

            {/* Thumbnail */}
            {resource.thumbnail_url && (
              <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resource.thumbnail_url}
                  alt={resource.title}
                  className="max-h-96 w-full object-contain"
                />
              </div>
            )}

            {/* Action button */}
            <div className="mt-6 flex flex-wrap gap-3">
              {hasFile && (
                <a
                  href={`/api/resources/${encodeURIComponent(resource.id)}/download`}
                  className="inline-block rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
                >
                  Download ({formatFileSize(resource.file_size_bytes)})
                </a>
              )}
              {hasExternal && (
                <a
                  href={resource.external_url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-gray-700"
                >
                  Visit External Link →
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Metadata aside */}
        <aside className="lg:col-span-1 space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-3 text-sm font-semibold uppercase text-gray-500">File Information</h2>
            <dl className="space-y-3 text-sm">
              {resource.file_filename && (
                <div>
                  <dt className="text-gray-500">Filename</dt>
                  <dd className="break-all font-medium text-gray-900">{resource.file_filename}</dd>
                </div>
              )}
              {resource.file_content_type && (
                <div>
                  <dt className="text-gray-500">File type</dt>
                  <dd className="font-medium text-gray-900">{resource.file_content_type}</dd>
                </div>
              )}
              <div>
                <dt className="text-gray-500">Size</dt>
                <dd className="font-medium text-gray-900">{formatFileSize(resource.file_size_bytes)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Downloads</dt>
                <dd className="font-medium text-gray-900">{resource.download_count}</dd>
              </div>
            </dl>
          </div>

          <Link
            href="/resources"
            className="inline-block text-sm text-blue-600 hover:underline"
          >
            ← Back to Resources
          </Link>
        </aside>
      </div>
    </Container>
  );
}
