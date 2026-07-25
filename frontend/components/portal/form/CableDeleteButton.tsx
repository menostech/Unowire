'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalApiClient } from '@/lib/portalApiClient';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

interface CableDeleteButtonProps {
  cableId: string;
  cableName: string;
}

export function CableDeleteButton({ cableId, cableName }: CableDeleteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // DeleteConfirmDialog catches errors from onConfirm and surfaces them in the
  // dialog (e.g. a 404 "This cable no longer exists." message), so we let
  // errors propagate rather than closing the dialog ourselves.
  async function handleConfirm() {
    await portalApiClient.cables.remove(cableId);
    router.push('/portal/cables');
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
        title="Delete cable"
        message={`Are you sure you want to delete ${cableName}? This cannot be undone.`}
        onCancel={() => setOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}
