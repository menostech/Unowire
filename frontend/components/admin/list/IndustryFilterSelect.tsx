'use client';

interface IndustryFilterSelectProps {
  industries: { id: string; label: string }[];
  value: string | undefined;
}

export function IndustryFilterSelect({ industries, value }: IndustryFilterSelectProps) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => {
        const val = e.target.value;
        window.location.href = val
          ? `/admin/industries/categories?industry_id=${encodeURIComponent(val)}`
          : '/admin/industries/categories';
      }}
      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
    >
      <option value="">All industries</option>
      {industries.map((ind) => (
        <option key={ind.id} value={ind.id}>
          {ind.label}
        </option>
      ))}
    </select>
  );
}
