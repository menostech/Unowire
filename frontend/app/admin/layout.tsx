// Pass-through root layout for /admin.
// The actual sidebar + header shell lives in the (dashboard) route group
// so the login page (in the (auth) group) is not wrapped by it.
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
