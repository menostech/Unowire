export default function PortalResourcesLoading() {
  return (
    <div>
      <div className="mb-6 h-8 w-32 animate-pulse rounded bg-gray-200" />
      <div className="overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="border-b bg-gray-50 px-4 py-3">
          <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="border-b border-gray-100 px-4 py-3">
            <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
