'use client';

import { useEffect, useState } from 'react';

export function MessagesUnreadBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    fetch('/api/member/messages/unread-count')
      .then((res) => (res.ok ? res.json() : { unread: 0 }))
      .then((data) => setCount(data.unread || 0))
      .catch(() => setCount(0));
  }, []);

  if (count === 0) return null;

  return (
    <span className="ml-auto inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-xs text-white" style={{ height: '1rem' }}>
      {count > 9 ? '9+' : count}
    </span>
  );
}
