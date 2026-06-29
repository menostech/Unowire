import { permanentRedirect, notFound } from 'next/navigation';

// Legacy /categories/[...slugs] → new /cables/[industry]/[category] routes.
// 9 entries mapped from the old categories.json node structure.
const LEGACY_REDIRECTS: Record<string, string> = {
  'automotive': '/cables/automotive-ev',
  'automotive/wiring-harness': '/cables/automotive-ev/automotive',
  'automotive/wiring-harness/pvc-insulated': '/cables/automotive-ev/automotive',
  'automotive/wiring-harness/pvc-insulated/thin-wall': '/cables/automotive-ev/automotive',
  'consumer-electronics': '/cables/consumer-electronics',
  'consumer-electronics/internal-wiring': '/cables/consumer-electronics/internal-wiring',
  'consumer-electronics/internal-wiring/pvc-insulated': '/cables/consumer-electronics/internal-wiring',
  'industrial': '/cables/utility',
  'industrial/power-transmission': '/cables/utility/power-transmission',
};

export default async function LegacyCategoryPage({
  params,
}: { params: Promise<{ slugs: string[] }> }) {
  const { slugs } = await params;
  const key = slugs.join('/');
  const target = LEGACY_REDIRECTS[key];
  if (target) {
    permanentRedirect(target);  // 308 permanent redirect
  }
  notFound();
}
