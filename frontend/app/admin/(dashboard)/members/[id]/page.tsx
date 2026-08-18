import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminApi } from '@/lib/adminApi';
import { MemberForm } from '@/components/admin/form/MemberForm';
import { MemberActions } from '@/components/admin/MemberActions';

export default async function EditMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const member = await adminApi.members.getById(parseInt(id));
  if (!member) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Edit Member: {member.email}</h1>

      {/* Read-only email display */}
      <div className="max-w-2xl">
        <div className="mb-1 block text-sm font-medium text-gray-700">Email (read-only)</div>
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
          {member.email}
        </div>
      </div>

      {/* Editable profile form */}
      <MemberForm initialData={member} />

      {/* Action buttons */}
      <div className="border-t pt-6">
        <h2 className="mb-4 text-lg font-semibold">Actions</h2>
        <MemberActions member={member} />
      </div>

      {/* Subscription management */}
      <div className="border-t pt-6">
        <h2 className="mb-4 text-lg font-semibold">Subscription</h2>
        <Link
          href={`/admin/members/${member.id}/subscription`}
          className="inline-block rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-gray-50"
        >
          Manage Subscription
        </Link>
      </div>

      {/* Metadata */}
      <div className="border-t pt-6">
        <h2 className="mb-4 text-lg font-semibold">Metadata</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-gray-500">Member ID</dt>
          <dd>{member.id}</dd>
          <dt className="text-gray-500">Created</dt>
          <dd>{new Date(member.created_at).toLocaleString()}</dd>
          <dt className="text-gray-500">Inquiries</dt>
          <dd>{member.inquiry_count}</dd>
          <dt className="text-gray-500">Verified</dt>
          <dd>{member.is_verified ? 'Yes' : 'No'}</dd>
          <dt className="text-gray-500">Active</dt>
          <dd>{member.is_active ? 'Yes' : 'No'}</dd>
        </dl>
      </div>
    </div>
  );
}
