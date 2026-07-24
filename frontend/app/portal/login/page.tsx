import { Suspense } from 'react';
import PortalLoginForm from './PortalLoginForm';

export default function PortalLoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading…</div>}>
      <PortalLoginForm />
    </Suspense>
  );
}