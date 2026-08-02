'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalApi } from '@/lib/portalApi';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

interface ResourceDeleteButtonProps {
  resourceId: string;
  resourceTitle: string;
}

export function ResourceDeleteButton({ resourceId, resourceTitle }: ResourceDeleteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleConfirm() {
    await portalApi.resources.remove(resourceId);
    router.push('/portal/resources');
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-red-600 hover:underline"
      >
        Delete
      </button>
      <DeleteConfirmDialog
        open={open}
        title="Delete resource"
        message={`Are you sure you want to delete ${resourceTitle}? This cannot be undone.`}
        onCancel={() => setOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}
