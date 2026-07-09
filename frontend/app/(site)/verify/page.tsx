'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function VerifyForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Missing verification token');
      return;
    }
    fetch('/api/member/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async res => {
        const data = await res.json();
        if (res.ok) {
          setStatus('success');
          setMessage(data.message || 'Email verified successfully.');
        } else {
          setStatus('error');
          setMessage(data.message || 'Verification failed.');
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('Network error');
      });
  }, [token]);

  return (
    <div className="max-w-md mx-auto mt-20 p-6 text-center">
      {status === 'loading' && <p className="text-gray-600 text-sm">Verifying...</p>}
      {status === 'success' && (
        <>
          <h1 className="text-2xl font-bold mb-4">Verified!</h1>
          <p className="text-gray-600 text-sm mb-4">{message}</p>
          <Link href="/login" className="text-blue-600 text-sm">Go to Login</Link>
        </>
      )}
      {status === 'error' && (
        <>
          <h1 className="text-2xl font-bold mb-4 text-red-600">Error</h1>
          <p className="text-gray-600 text-sm mb-4">{message}</p>
          <Link href="/register" className="text-blue-600 text-sm">Back to Register</Link>
        </>
      )}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyForm />
    </Suspense>
  );
}
