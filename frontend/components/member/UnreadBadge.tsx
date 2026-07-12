'use client';

import { useEffect, useState } from 'react';

export function UnreadBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    fetch('/api/member/inquiries/unread-count')
      .then(res => res.ok ? res.json() : { count: 0 })
      .then(data => setCount(data.count || 0))
      .catch(() => setCount(0));
  }, []);

  if (count === 0) return null;

  return (
    <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
      {count > 9 ? '9+' : count}
    </span>
  );
}
