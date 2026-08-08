import Link from 'next/link';

export function Breadcrumbs({ items }: { items: { name: string; url?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 font-mono text-[12px] text-muted-foreground">
      <span className="text-muted-foreground/40">/</span>
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2">
            {item.url ? (
              <Link href={item.url} className="transition hover:text-primary">{item.name}</Link>
            ) : (
              <span className="font-medium text-foreground">{item.name}</span>
            )}
            {i < items.length - 1 && <span className="text-muted-foreground/40">/</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
