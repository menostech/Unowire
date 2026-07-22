'use client';

export function PortalSidebar({ user }: { user: any }) {
  return (
    <aside className="sticky top-0 z-40 flex h-screen w-[268px] shrink-0 flex-col bg-blue-900 p-4 text-blue-100">
      <div className="mb-6 px-2 text-lg font-bold tracking-tight">
        {user?.role_name || 'Factory Portal'}
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        <div className="px-3 py-2 text-sm text-blue-300">Loading…</div>
      </nav>
    </aside>
  );
}
