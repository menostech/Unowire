import type { RecipientTarget } from '@/lib/types';

const GROUP_LABELS: Record<string, string> = {
  cable_managers: 'Cable Managers',
  equipment_managers: 'Equipment Managers',
  members: 'All Members',
};

/**
 * Format a short human-readable summary of a message's recipients.
 * - broadcast (or null/empty targets) → "All Members"
 * - targeted → comma-separated labels (group label for groups, raw id for user/member)
 */
export function formatRecipientSummary(
  targets: RecipientTarget[] | null,
  type: string,
): string {
  if (type === 'broadcast' || !targets || targets.length === 0) {
    return 'All Members';
  }
  return targets
    .map((t) => {
      if (t.kind === 'group') return GROUP_LABELS[t.value] ?? t.value;
      // For user/member, the value is the id (email lookup deferred to a future enhancement).
      return t.value;
    })
    .join(', ');
}
