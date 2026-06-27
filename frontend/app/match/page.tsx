import type { Metadata } from 'next';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { MatchForm } from '@/components/match/MatchForm';

export const metadata: Metadata = {
  title: 'Equipment Match Tool',
  description: 'Find wire processing equipment that matches your cable specifications.',
  robots: { index: false, follow: false }, // noindex — interactive tool, not content
};

export default function MatchPage() {
  return (
    <Container className="py-8">
      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Match Tool' },
      ]} />

      <h1 className="text-3xl font-bold mb-2">Equipment Match Tool</h1>
      <p className="text-gray-600 mb-6">
        Enter your cable parameters to find matching wire processing equipment.
        The tool recommends top equipment based on conductor area, outer diameter, and other specs.
      </p>

      <MatchForm />
    </Container>
  );
}
