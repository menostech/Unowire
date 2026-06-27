import type { Cable } from '@/lib/types';
import { formatShielding, formatJacket, formatCoreStructure } from '@/lib/utils';

export function CableSpecTable({ cable }: { cable: Cable }) {
  const specs = [
    { label: 'Brand', value: cable.brand },
    { label: 'Model', value: cable.model },
    { label: 'Specification', value: cable.spec },
    { label: 'AWG', value: cable.awg || '—' },
    { label: 'Conductor Area', value: `${cable.conductor_area} mm²` },
    { label: 'Outer Diameter', value: `${cable.outer_diameter} mm` },
    { label: 'Insulation Material', value: cable.insulation_material || '—' },
    { label: 'Shielding', value: formatShielding(cable.shielding) },
    { label: 'Jacket', value: formatJacket(cable.jacket) },
    { label: 'Core Structure', value: formatCoreStructure(cable.core_structure) },
    { label: 'Rated Voltage', value: cable.rated_voltage || '—' },
    { label: 'Temperature Rating', value: cable.temperature_rating || '—' },
  ];

  return (
    <table className="w-full">
      <tbody>
        {specs.map(s => (
          <tr key={s.label} className="border-b border-gray-100">
            <td className="py-2 pr-4 font-medium text-gray-700 w-1/3">{s.label}</td>
            <td className="py-2 text-gray-900">{s.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
