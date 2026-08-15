interface EmptyStateProps {
  title?: string;
  message?: string;
  actionLabel?: string;
  actionHref?: string;
}

export function EmptyState({
  title = 'No results found',
  message = 'Try adjusting your filters or search terms.',
  actionLabel,
  actionHref,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted/30 px-6 py-16 text-center">
      {/* Industrial icon — empty box schematic */}
      <svg
        className="mb-4 size-12 text-muted-foreground/30"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
        />
      </svg>
      <p className="text-base font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      {actionLabel && actionHref && (
        <a
          href={actionHref}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-95"
        >
          {actionLabel}
        </a>
      )}
    </div>
  );
}
