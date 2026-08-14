import { redirect, RedirectType } from 'next/navigation';
export default function OldAdminTerminalsCatchAllPage({ params }: { params: { slug: string[] } }) {
  const rest = params.slug.join('/');
  redirect('/admin/connectivity/' + rest, RedirectType.replace);
}
