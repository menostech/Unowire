export function PageSkeleton() {
  return (
    <div className="animate-fade-in py-8">
      {/* Breadcrumb skeleton */}
      <div className="mb-6 flex items-center gap-2">
        <div className="h-3 w-12 rounded bg-muted" />
        <div className="h-3 w-3 rounded bg-muted" />
        <div className="h-3 w-20 rounded bg-muted" />
      </div>

      {/* Title skeleton */}
      <div className="mb-2 h-3 w-24 rounded bg-muted/60" />
      <div className="mb-6 h-8 w-64 rounded bg-muted" />

      {/* Grid skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-lg border border-border bg-card"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="aspect-square bg-muted" />
            <div className="space-y-2 p-4">
              <div className="h-4 w-3/4 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted/60" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="animate-fade-in py-8">
      {/* Breadcrumb skeleton */}
      <div className="mb-6 flex items-center gap-2">
        <div className="h-3 w-12 rounded bg-muted" />
        <div className="h-3 w-3 rounded bg-muted" />
        <div className="h-3 w-24 rounded bg-muted" />
      </div>

      {/* Mono label skeleton */}
      <div className="mb-2 h-3 w-28 rounded bg-muted/60" />

      <div className="grid gap-8 lg:grid-cols-4">
        {/* Main content */}
        <div className="space-y-6 lg:col-span-3">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="aspect-[4/3] rounded-lg bg-muted" />
            <div className="space-y-3">
              <div className="h-7 w-3/4 rounded bg-muted" />
              <div className="h-4 w-1/2 rounded bg-muted/60" />
              <div className="h-10 w-32 rounded bg-muted" />
            </div>
          </div>
          {/* Spec table skeleton */}
          <div className="space-y-2">
            <div className="h-5 w-40 rounded bg-muted" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex justify-between border-b border-border py-2">
                <div className="h-4 w-24 rounded bg-muted/60" />
                <div className="h-4 w-32 rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
        {/* Sidebar */}
        <div className="space-y-6 lg:col-span-1">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 h-4 w-20 rounded bg-muted/60" />
            <div className="aspect-square rounded bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}
