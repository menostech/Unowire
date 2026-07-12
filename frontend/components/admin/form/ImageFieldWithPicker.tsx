'use client';

import { useState } from 'react';
import { MediaPickerModal } from './MediaPickerModal';

interface ImageFieldWithPickerProps {
  label?: string;
  value: string;
  onChange: (url: string) => void;
}

const inputClass =
  'rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

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
          className="px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
        >
          Media
        </button>
      </div>
      {value && (
        <div className="mt-2">
          <img src={value} alt="Preview" className="h-24 w-24 object-cover rounded" />
        </div>
      )}
      <MediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(urlPath) => onChange(urlPath)}
      />
    </div>
  );
}
