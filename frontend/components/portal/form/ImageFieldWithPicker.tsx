'use client';

import { useState } from 'react';
import { PortalMediaPickerModal } from '@/components/portal/media/PortalMediaPickerModal';

interface ImageFieldWithPickerProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
}

const inputClass =
  'rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground';

export function ImageFieldWithPicker({
  label = 'Image URL',
  value,
  onChange,
}: ImageFieldWithPickerProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} flex-1`}
          placeholder="/media/uploads/xxx.webp"
        />
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="rounded-md border border-accent-foreground/30 bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent"
        >
          Media
        </button>
      </div>
      {value && (
        <div className="mt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Preview" className="h-24 w-24 rounded object-cover" />
        </div>
      )}
      <PortalMediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(url) => {
          onChange(url);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
