export default function PortalMediaLoading() {
  return (
    <div>
      <div className="mb-6 h-8 w-40 animate-pulse rounded bg-gray-200" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="h-48 animate-pulse rounded-lg bg-white shadow-sm" />
        <div className="lg:col-span-2 h-48 animate-pulse rounded-lg bg-white shadow-sm" />
      </div>
    </div>
  );
}
