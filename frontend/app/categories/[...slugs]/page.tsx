import { permanentRedirect } from 'next/navigation';

// Legacy /categories/[...slugs] → /cables (intermediate pages removed)
export default async function LegacyCategoryPage() {
  permanentRedirect('/cables');
}
