import { redirect, RedirectType } from 'next/navigation';
export default function OldTerminalsListPage() {
  redirect('/connectivity', RedirectType.replace);
}
