export function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(' ');
}

export function formatCableUrl(brandSlug: string, slug: string): string {
  return `/cables/${brandSlug}/${slug}`;
}

export function formatEquipmentUrl(brandSlug: string, slug: string): string {
  return `/equipments/${brandSlug}/${slug}`;
}

export function formatManufacturerUrl(slug: string): string {
  return `/manufacturers/${slug}`;
}

export function formatEquipmentType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function formatCoreStructure(core: string): string {
  const map: Record<string, string> = {
    single: 'Single Core',
    '2_core': '2 Core',
    '3_core': '3 Core',
    '4_core': '4 Core',
    multi_core: 'Multi Core',
  };
  return map[core] || core;
}

export function formatShielding(shielding: string): string {
  const map: Record<string, string> = {
    none: 'None',
    braided: 'Braided',
    spiral: 'Spiral',
    foil: 'Foil',
  };
  return map[shielding] || shielding;
}

export function formatJacket(jacket: string): string {
  const map: Record<string, string> = {
    none: 'None',
    pvc: 'PVC',
    pu: 'PU',
    lszh: 'LSZH',
  };
  return map[jacket] || jacket.toUpperCase();
}
