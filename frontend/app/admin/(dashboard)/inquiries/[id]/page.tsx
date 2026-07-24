import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReplyForm } from '@/components/admin/form/ReplyForm';
import { recipientDisplayName } from '@/lib/utils';

export default async function AdminInquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  const res = await fetch(`${process.env.INTERNAL_API_BASE || 'http://backend:8000'}/api/admin/inquiries/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    notFound();
  }
  const inquiry = await res.json();

  return (
    <div>
      <Link href="/admin/inquiries" className="text-sm text-gray-600 hover:text-blue-600 mb-4 inline-block">
        &larr; Back to Inquiries
      </Link>
      <h1 className="text-xl font-bold mb-4">{inquiry.subject}</h1>
      <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
        <div>
          <p className="text-gray-500">Inquiry ID:</p>
          <p>#{inquiry.id}</p>
        </div>
        <div>
          <p className="text-gray-500">Recipient:</p>
          <p>{recipientDisplayName(inquiry.recipient_name)}</p>
        </div>
        <div>
          <p className="text-gray-500">Created:</p>
          <p>{new Date(inquiry.created_at).toLocaleString()}</p>
        </div>
        <div>
          <p className="text-gray-500">Status:</p>
          <p>{inquiry.reply_body ? 'Replied' : 'Pending'}</p>
        </div>
      </div>
      <div className="border border-gray-200 rounded p-4 mb-6">
        <p className="text-xs text-gray-500 mb-2">Member message</p>
        <p className="text-sm whitespace-pre-wrap">{inquiry.body}</p>
      </div>
      {inquiry.reply_body ? (
        <div className="border border-blue-200 bg-blue-50 rounded p-4">
          <p className="text-xs text-blue-600 mb-2">Your reply</p>
          <p className="text-sm whitespace-pre-wrap">{inquiry.reply_body}</p>
          {inquiry.replied_at && (
            <p className="text-xs text-gray-400 mt-2">{new Date(inquiry.replied_at).toLocaleString()}</p>
          )}
        </div>
      ) : (
        <div>
          <h2 className="text-sm font-medium mb-3">Reply to this inquiry</h2>
          <ReplyForm inquiryId={inquiry.id} />
        </div>
      )}
    </div>
  );
}
