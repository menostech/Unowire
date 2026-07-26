import Link from 'next/link';
import { notFound } from 'next/navigation';
import { portalApi } from '@/lib/portalApi';

export default async function PortalMessageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let message;
  try {
    message = await portalApi.messages.getById(Number(id));
  } catch {
    notFound();
  }
  return (
    <div>
      <Link
        href="/portal/messages"
        className="mb-4 inline-block text-sm text-blue-600 hover:underline"
      >
        &larr; Back to Messages
      </Link>
      <h1 className="mb-2 text-2xl font-bold text-gray-900">{message.title}</h1>
      <p className="mb-6 text-sm text-gray-500">
        {message.created_at ? new Date(message.created_at).toLocaleString() : ''}
      </p>
      <div className="prose max-w-none whitespace-pre-wrap text-sm text-gray-800">
        {message.body}
      </div>
    </div>
  );
}
