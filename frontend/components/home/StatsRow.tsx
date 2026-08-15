interface StatsRowProps {
  cables: number;
  industries: number;
  equipment: number;
  manufacturers: number;
}

interface Stat {
  label: string;
  value: number;
  code: string;
}

export function StatsRow({ cables, industries, equipment, manufacturers }: StatsRowProps) {
  const stats: Stat[] = [
    { code: '01', label: 'Cables', value: cables },
    { code: '02', label: 'Industries', value: industries },
    { code: '03', label: 'Equipment', value: equipment },
    { code: '04', label: 'Manufacturers', value: manufacturers },
  ];

  return (
    <section className="relative border-b border-border bg-card">
      {/* Top accent line */}
      <div className="absolute inset-x-0 top-0 h-0.5 bg-primary" />
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className="group relative px-6 py-8 transition-colors hover:bg-secondary/50 animate-fade-in-up"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="mono-label text-muted-foreground/50">
              {stat.code} /
            </div>
            <p
              className="mt-2 text-4xl font-bold tracking-tight tabular-nums text-foreground transition-colors group-hover:text-primary"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              {stat.value.toLocaleString()}
              {stat.value > 0 && (
                <span className="ml-1 text-xs align-top text-primary">↑</span>
              )}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
            {/* Amber underline on hover */}
            <span className="absolute bottom-0 left-0 h-0.5 w-0 bg-primary transition-all duration-300 group-hover:w-full" />
          </div>
        ))}
      </div>
    </section>
  );
}
