import { notFound } from 'next/navigation';
import { adminApi } from '@/lib/adminApi';
import { MessageActions } from '@/components/admin/MessageActions';

export default async function MessageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const message = await adminApi.messages.getById(parseInt(id));
  if (!message) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{message.title}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Published by {message.created_by_email ?? 'Unknown'} on{' '}
          {new Date(message.created_at).toLocaleString()}
        </p>
      </div>
      <div className="whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
        {message.body}
      </div>
      <div className="border-t pt-6">
        <h2 className="mb-4 text-lg font-semibold">Actions</h2>
        <MessageActions messageId={message.id} />
      </div>
    </div>
  );
}
