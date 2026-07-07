'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface MenuSortButtonsProps {
  id: string;
}

export function MenuSortButtons({ id }: MenuSortButtonsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSort(direction: 'up' | 'down') {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/menu/${encodeURIComponent(id)}/sort`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      });
      if (res.ok) {
        router.refresh();
      }
    } catch {
      // ignore — user can retry
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center">
      <button
        type="button"
        disabled={busy}
        onClick={() => handleSort('up')}
        className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
        title="Move up"
      >
        <ChevronUp className="size-4" />
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => handleSort('down')}
        className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
        title="Move down"
      >
        <ChevronDown className="size-4" />
      </button>
    </div>
  );
}
