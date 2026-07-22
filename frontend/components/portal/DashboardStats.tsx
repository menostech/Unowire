import Link from 'next/link';

interface StatCard {
  label: string;
  value: number;
  href?: string;
}

export function DashboardStats({ stats, scopeType }: {
  stats: {
    cables_count?: number;
    equipment_count?: number;
    views_total: number;
    views_trend_30d: number;
    inquiries_total: number;
    inquiries_unread: number;
  };
  scopeType: string;
}) {
  const cards: StatCard[] = [];
  if (scopeType === 'manufacturer') {
    cards.push({ label: 'Cables', value: stats.cables_count ?? 0, href: '/portal/cables' });
  } else if (scopeType === 'equipment_manufacturer') {
    cards.push({ label: 'Equipment', value: stats.equipment_count ?? 0, href: '/portal/equipment' });
  }
  cards.push({ label: 'Views', value: stats.views_total ?? 0 });
  cards.push({ label: 'Views (30d)', value: stats.views_trend_30d ?? 0 });
  cards.push({ label: 'Inquiries', value: stats.inquiries_total ?? 0, href: '/portal/inquiries' });
  cards.push({ label: 'Unread', value: stats.inquiries_unread ?? 0, href: '/portal/inquiries' });

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => {
        const content = (
          <div className="rounded-lg bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase text-gray-500">{card.label}</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{card.value}</p>
          </div>
        );
        return card.href ? (
          <Link key={card.label} href={card.href} className="transition hover:shadow-md">
            {content}
          </Link>
        ) : (
          <div key={card.label}>{content}</div>
        );
      })}
    </div>
  );
}
