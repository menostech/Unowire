'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SearchBox({
  placeholder = 'Search cables by brand, model, or AWG...',
  basePath = '/cables',
  paramName = 'q',
}: {
  placeholder?: string;
  basePath?: string;
  paramName?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (value) params.set(paramName, value);
    router.push(`${basePath}?${params.toString()}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full max-w-md">
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder={placeholder}
        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
        Search
      </button>
    </form>
  );
}
