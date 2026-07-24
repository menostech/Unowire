import Link from 'next/link';
import { MessageForm } from '@/components/admin/form/MessageForm';

export default function NewMessagePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">New Message</h1>
        <Link
          href="/admin/messages"
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          ← Back to list
        </Link>
      </div>
      <MessageForm />
    </div>
  );
}
