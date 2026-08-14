import { PageSkeleton } from '@/components/shared/PageSkeleton';
import { Container } from '@/components/layout/Container';

export default function Loading() {
  return (
    <Container>
      <PageSkeleton />
    </Container>
  );
}
