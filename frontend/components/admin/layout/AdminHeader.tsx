interface AdminHeaderProps {
  email: string;
}

export function AdminHeader({ email }: AdminHeaderProps) {
  return (
    <header className="flex h-12 items-center border-b bg-white px-4">
      <div className="flex-1" />
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <span className="text-gray-400">Signed in as</span>
        <span className="font-medium text-gray-900">{email}</span>
      </div>
    </header>
  );
}
