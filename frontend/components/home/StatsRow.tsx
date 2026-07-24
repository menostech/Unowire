interface StatsRowProps {
  cables: number;
  brands: number;
  industries: number;
  equipment: number;
  manufacturers: number;
}

interface Stat {
  label: string;
  value: number;
}

export function StatsRow({ cables, brands, industries, equipment, manufacturers }: StatsRowProps) {
  const stats: Stat[] = [
    { label: 'Cables', value: cables },
    { label: 'Brands', value: brands },
    { label: 'Industries', value: industries },
    { label: 'Equipment', value: equipment },
    { label: 'Manufacturers', value: manufacturers },
  ];

  return (
    <section className="border-b bg-gray-50 py-8">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {stats.map(stat => (
          <div
            key={stat.label}
            className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm"
          >
            <p className="text-3xl font-bold text-blue-600">{stat.value}</p>
            <p className="text-sm text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
