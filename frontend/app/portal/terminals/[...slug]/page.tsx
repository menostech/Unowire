import { redirect, RedirectType } from 'next/navigation';
export default function OldPortalTerminalsCatchAllPage({ params }: { params: { slug: string[] } }) {
  const rest = params.slug.join('/');
  redirect('/portal/connectivity/' + rest, RedirectType.replace);
}
