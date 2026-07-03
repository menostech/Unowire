import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { adminApi } from '@/lib/adminApi';
import { AdminSidebar } from '@/components/admin/layout/AdminSidebar';
import { AdminHeader } from '@/components/admin/layout/AdminHeader';

// Auth guard for dashboard routes. The middleware already redirects when the
// cookie is absent; here we additionally validate the token against the
// backend so an invalid/expired token also bounces to login.
export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  if (!token) {
    redirect('/admin/login');
  }
  const user = await adminApi.auth.me();
  if (!user) {
    redirect('/admin/login');
  }
  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <div className="flex flex-1 flex-col">
        <AdminHeader email={user.email} />
        <main className="flex-1 bg-gray-50 p-6">{children}</main>
      </div>
    </div>
  );
}
