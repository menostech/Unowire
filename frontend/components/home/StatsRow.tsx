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
      <div className="flex flex-wrap justify-center gap-8 md:gap-12">
        {stats.map(stat => (
          <div key={stat.label} className="text-center">
            <p className="text-3xl font-bold text-blue-600">{stat.value}</p>
            <p className="text-sm text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
