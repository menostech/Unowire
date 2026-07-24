import { notFound } from 'next/navigation';
import { portalApi } from '@/lib/portalApi';
import { ReplyForm } from '@/components/portal/form/ReplyForm';

export default async function PortalInquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let inquiry: any;
  try {
    inquiry = await portalApi.inquiries.getById(Number(id));
  } catch {
    notFound();
  }
  return (
    <div className="max-w-2xl">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">{inquiry.subject}</h1>
      <p className="mb-4 text-xs text-gray-400">
        {inquiry.created_at ? new Date(inquiry.created_at).toLocaleString() : ''}
      </p>
      <div className="mb-6 whitespace-pre-wrap rounded-lg bg-white p-4 text-sm text-gray-700 shadow-sm">
        {inquiry.body}
      </div>
      {inquiry.reply_body ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-green-800">Reply</h2>
          <p className="whitespace-pre-wrap text-sm text-green-900">{inquiry.reply_body}</p>
        </div>
      ) : (
        <ReplyForm inquiryId={inquiry.id} />
      )}
    </div>
  );
}
