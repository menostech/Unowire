import type { ApplicableSpecRule } from '@/lib/types';
import { specKeyLabel } from '@/lib/terminalFilter';

export function ApplicableSpecsTable({ specs }: { specs: ApplicableSpecRule[] }) {
  if (!specs || specs.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No applicable specifications defined.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-600">
            <th className="px-4 py-3 font-medium">Spec</th>
            <th className="px-4 py-3 font-medium">Range</th>
            <th className="px-4 py-3 font-medium">Allowed Values</th>
          </tr>
        </thead>
        <tbody>
          {specs.map((spec, i) => {
            const isRange = spec.min !== undefined || spec.max !== undefined;
            const isEnum = spec.allowed_values && spec.allowed_values.length > 0;
            return (
              <tr key={`${spec.spec_key}-${i}`} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {specKeyLabel(spec.spec_key)}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {isRange ? (
                    <span>
                      {spec.min !== undefined ? spec.min : '—'}
                      {' – '}
                      {spec.max !== undefined ? spec.max : '—'}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {isEnum ? (
                    <span>{(spec.allowed_values ?? []).join(', ')}</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
