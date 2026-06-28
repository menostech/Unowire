import { cn } from '@/lib/utils';

export function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('w-full px-6', className)}>
      {children}
    </div>
  );
}
