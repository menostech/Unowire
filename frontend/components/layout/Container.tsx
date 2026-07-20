import { cn } from '@/lib/utils';

export function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('w-full px-8 md:px-12', className)}>
      {children}
    </div>
  );
}
