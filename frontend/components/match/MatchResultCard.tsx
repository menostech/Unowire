import Link from 'next/link';
import type { MatchResultItem } from '@/lib/types';
import { ScoreBar } from '@/components/shared/ScoreBar';
import { RuleBadge } from './RuleBadge';
import { formatEquipmentUrl, formatEquipmentType } from '@/lib/utils';

export function MatchResultCard({ result, rank }: { result: MatchResultItem; rank: number }) {
  const { equipment, score, matched_rules, explanation } = result;
  return (
    <div className="border border-gray-200 rounded-lg p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-gray-400 font-medium">#{rank}</span>
            <Link
              href={formatEquipmentUrl(equipment.brand_slug, equipment.slug)}
              className="font-semibold text-lg text-gray-900 hover:text-blue-600"
            >
              {equipment.brand} {equipment.model}
            </Link>
          </div>
          <p className="text-gray-600 text-sm capitalize">{formatEquipmentType(equipment.equipment_type)}</p>
        </div>
        <div className="w-32">
          <ScoreBar score={score} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
        {matched_rules.map(r => (
          <div key={r.cable_field} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-gray-600">{r.cable_field.replace(/_/g, ' ')}</span>
            <RuleBadge passed={r.passed} required={r.required} skipped={r.skipped} />
          </div>
        ))}
      </div>

      <p className="text-sm text-gray-500 italic mb-3">{explanation}</p>

      <div className="flex gap-3">
        <Link
          href={formatEquipmentUrl(equipment.brand_slug, equipment.slug)}
          className="text-blue-600 hover:underline text-sm"
        >
          View Details →
        </Link>
        {equipment.spec_pdf_url && (
          <a
            href={equipment.spec_pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline text-sm"
          >
            Spec Sheet (PDF)
          </a>
        )}
      </div>
    </div>
  );
}
