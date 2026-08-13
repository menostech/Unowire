'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalApiClient } from '@/lib/portalApiClient';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

interface TerminalDeleteButtonProps {
  terminalId: string;
  terminalName: string;
}

export function TerminalDeleteButton({ terminalId, terminalName }: TerminalDeleteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleConfirm() {
    await portalApiClient.terminals.remove(terminalId);
    router.push('/portal/connectivity');
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded border border-red-600 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
      >
        Delete
      </button>
      <DeleteConfirmDialog
        open={open}
        title="Delete product"
        message={`Are you sure you want to delete ${terminalName}? This cannot be undone.`}
        onCancel={() => setOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}

