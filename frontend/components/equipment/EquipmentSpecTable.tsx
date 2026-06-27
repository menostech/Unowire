import type { Equipment } from '@/lib/types';
import { formatEquipmentType, formatShielding, formatJacket, formatCoreStructure } from '@/lib/utils';

export function EquipmentSpecTable({ equipment }: { equipment: Equipment }) {
  const specs = [
    { label: 'Brand', value: equipment.brand },
    { label: 'Model', value: equipment.model },
    { label: 'Equipment Type', value: formatEquipmentType(equipment.equipment_type) },
    { label: 'Automation Level', value: equipment.automation_level.replace(/_/g, ' ') },
    { label: 'Conductor Area Range', value: `${equipment.conductor_area_min} – ${equipment.conductor_area_max} mm²` },
    { label: 'Outer Diameter Range', value: `${equipment.outer_diameter_min} – ${equipment.outer_diameter_max} mm` },
    { label: 'Cut Length Range', value: `${equipment.cut_length_min} – ${equipment.cut_length_max} mm` },
    { label: 'Supported Shieldings', value: equipment.supported_shieldings.map(formatShielding).join(', ') },
    { label: 'Supported Jackets', value: equipment.supported_jackets.map(formatJacket).join(', ') },
    { label: 'Supported Core Structures', value: equipment.supported_cores.map(formatCoreStructure).join(', ') },
  ];

  return (
    <table className="w-full">
      <tbody>
        {specs.map(s => (
          <tr key={s.label} className="border-b border-gray-100">
            <td className="py-2 pr-4 font-medium text-gray-700 w-1/3">{s.label}</td>
            <td className="py-2 text-gray-900 capitalize">{s.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
