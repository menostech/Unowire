import Link from 'next/link';

export function Pagination({
  page,
  totalPages,
  basePath,
  searchParams,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;

  const buildUrl = (p: number) => {
    const params = new URLSearchParams();
    Object.entries(searchParams).forEach(([k, v]) => {
      if (v !== undefined && v !== '' && k !== 'page') params.set(k, v);
    });
    params.set('page', String(p));
    return `${basePath}?${params.toString()}`;
  };

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(p => Math.abs(p - page) <= 2 || p === 1 || p === totalPages);

  return (
    <nav className="flex justify-center items-center gap-2 mt-8" aria-label="Pagination">
      {page > 1 && (
        <Link href={buildUrl(page - 1)} className="px-3 py-1 border rounded hover:bg-gray-100">
          ← Prev
        </Link>
      )}
      {pages.map((p, i) => {
        // Insert ellipsis
        const prev = pages[i - 1];
        const showEllipsis = prev && p - prev > 1;
        return (
          <span key={p} className="flex items-center gap-2">
            {showEllipsis && <span className="text-gray-400">…</span>}
            <Link
              href={buildUrl(p)}
              className={`px-3 py-1 border rounded ${
                p === page ? 'bg-accent-foreground text-background border-accent-foreground' : 'hover:bg-gray-100'
              }`}
            >
              {p}
            </Link>
          </span>
        );
      })}
      {page < totalPages && (
        <Link href={buildUrl(page + 1)} className="px-3 py-1 border rounded hover:bg-gray-100">
          Next →
        </Link>
      )}
    </nav>
  );
}
