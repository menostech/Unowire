'use client';

interface CategoryFilterSelectProps {
  categories: { id: string; label: string; industry_id: string }[];
  value: string | undefined;
}

export function CategoryFilterSelect({ categories, value }: CategoryFilterSelectProps) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => {
        const val = e.target.value;
        window.location.href = val
          ? `/admin/industries/product-types?category_id=${encodeURIComponent(val)}`
          : '/admin/industries/product-types';
      }}
      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
    >
      <option value="">All categories</option>
      {categories.map((cat) => (
        <option key={cat.id} value={cat.id}>
          {cat.label}
        </option>
      ))}
    </select>
  );
}
