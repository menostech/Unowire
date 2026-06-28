import type { SpecItem } from '@/lib/types';
import { formatSpecValue } from '@/lib/utils';

interface CableSpecTableProps {
  specs: SpecItem[];
  title?: string;
}

export function CableSpecTable({ specs, title = "Common Specs" }: CableSpecTableProps) {
  if (specs.length === 0) return null;
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      <table className="w-full text-sm border-collapse">
        <tbody>
          {specs.map(spec => (
            <tr key={spec.key} className="border-b last:border-0">
              <td className="py-2 px-3 text-gray-600 w-1/3">{spec.label}</td>
              <td className="py-2 px-3 text-gray-900">{formatSpecValue(spec)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
