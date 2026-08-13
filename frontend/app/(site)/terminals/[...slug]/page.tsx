import { redirect, RedirectType } from 'next/navigation';
export default function OldTerminalsCatchAllPage({ params }: { params: { slug: string[] } }) {
  const rest = params.slug.join('/');
  redirect(/connectivity/ + rest, RedirectType.replace);
}
