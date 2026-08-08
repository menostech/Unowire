'use client';

import { useState } from 'react';
import Link from 'next/link';
import { recipientDisplayName } from '@/lib/utils';

interface InquiriesTableProps {
  inquiries: any[];
}

export function InquiriesTable({ inquiries }: InquiriesTableProps) {
  const [enterpriseOnly, setEnterpriseOnly] = useState(false);

  const visible = enterpriseOnly
    ? inquiries.filter((i) => i.recipient_type === 'enterprise_sales')
    : inquiries;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={enterpriseOnly}
            onChange={(e) => setEnterpriseOnly(e.target.checked)}
            className="rounded"
          />
          Enterprise sales only
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="text-gray-500 text-sm">
          No inquiries{enterpriseOnly ? ' (enterprise)' : ''} yet.
        </p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-700">ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Subject</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Recipient</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Created</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((i: any) => {
                const isEnterprise = i.recipient_type === 'enterprise_sales';
                return (
                  <tr key={i.id} className={!i.is_read ? 'bg-accent' : ''}>
                    <td className="px-4 py-3 text-gray-600">#{i.id}</td>
                    <td className="px-4 py-3">
                      {!i.is_read && (
                        <span className="inline-block w-2 h-2 bg-accent-foreground rounded-full mr-2"></span>
                      )}
                      {i.subject}
                      {isEnterprise && (
                        <span className="ml-2 rounded bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">
                          Enterprise Sales
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {recipientDisplayName(i.recipient_name)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          i.reply_body ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {i.reply_body ? 'Replied' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(i.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/inquiries/${i.id}`}
                        className="text-accent-foreground hover:underline text-sm"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}