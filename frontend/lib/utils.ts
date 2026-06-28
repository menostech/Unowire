import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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

import type { Cable, SpecItem, CableVariant } from './types';

/** 从 cable 的 common_specs 或 variant specs 查找 SpecItem */
export function findSpecItem(cable: Cable, key: string): SpecItem | undefined {
  for (const s of cable.common_specs) {
    if (s.key === key) return s;
  }
  for (const v of cable.variants) {
    for (const s of v.specs) {
      if (s.key === key) return s;
    }
  }
  return undefined;
}

/** 从 variant 的 specs 查找 SpecItem */
export function findVariantSpec(variant: CableVariant, key: string): SpecItem | undefined {
  return variant.specs.find(s => s.key === key);
}

/** 获取 cable 的主变体（第一个 variant） */
export function getPrimaryVariant(cable: Cable): CableVariant | null {
  return cable.variants[0] ?? null;
}

/** 格式化 SpecItem 值（含单位） */
export function formatSpecValue(spec: SpecItem): string {
  if (spec.value === null || spec.value === undefined) return "—";
  const valueStr = String(spec.value);
  return spec.unit ? `${valueStr} ${spec.unit}` : valueStr;
}
