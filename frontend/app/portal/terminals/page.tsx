import { redirect, RedirectType } from 'next/navigation';
export default function OldPortalTerminalsListPage() {
  redirect('/portal/connectivity', RedirectType.replace);
}
