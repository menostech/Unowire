import { redirect, RedirectType } from 'next/navigation';
export default function OldAdminTerminalsListPage() {
  redirect('/admin/connectivity', RedirectType.replace);
}
