export default function Loading() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Messages</h1>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-lg bg-white p-4 shadow-sm">
            <div className="h-4 w-3/4 rounded bg-gray-200" />
            <div className="mt-2 h-3 w-1/4 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
