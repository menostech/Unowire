import type {
  Cable, CableListItem, CableListResponse,
  Equipment, EquipmentListItem, EquipmentListResponse,
  Manufacturer, MatchRule,
} from './types';

import manufacturersData from '@/data/manufacturers.json';
import cablesData from '@/data/cables.json';
import equipmentsData from '@/data/equipments.json';
import matchRulesData from '@/data/match-rules.json';

const MATCH_TOP_N = 3;
const MATCH_SCORE_THRESHOLD = 0.0;

// Type the imported JSON
const manufacturers = manufacturersData as Manufacturer[];
const cables = cablesData as Cable[];
const equipments = equipmentsData as Equipment[];
const matchRules = matchRulesData as MatchRule[];

function toListItem(cable: Cable): CableListItem {
  const { id, brand, brand_slug, model, slug, spec, awg, conductor_area, outer_diameter, shielding, jacket, core_structure } = cable;
  return { id, brand, brand_slug, model, slug, spec, awg, conductor_area, outer_diameter, shielding, jacket, core_structure };
}

function toEquipListItem(eq: Equipment): EquipmentListItem {
  const { id, brand, brand_slug, model, slug, equipment_type, automation_level, conductor_area_min, conductor_area_max } = eq;
  return { id, brand, brand_slug, model, slug, equipment_type, automation_level, conductor_area_min, conductor_area_max };
}

export const api = {
  manufacturers: {
    list(): Manufacturer[] {
      return [...manufacturers].sort((a, b) => a.name.localeCompare(b.name));
    },
    getBySlug(slug: string): Manufacturer | null {
      return manufacturers.find(m => m.slug === slug) || null;
    },
    cables(slug: string): CableListItem[] {
      const mfr = manufacturers.find(m => m.slug === slug);
      if (!mfr) return [];
      return cables.filter(c => c.manufacturer_id === mfr.id).map(toListItem);
    },
    equipments(slug: string): EquipmentListItem[] {
      const mfr = manufacturers.find(m => m.slug === slug);
      if (!mfr) return [];
      return equipments.filter(e => e.manufacturer_id === mfr.id).map(toEquipListItem);
    },
  },

  cables: {
    list(params: {
      q?: string;
      awg?: string;
      brand?: string;
      shielding?: string;
      jacket?: string;
      core_structure?: string;
      conductor_area_min?: number;
      conductor_area_max?: number;
      outer_diameter_min?: number;
      outer_diameter_max?: number;
      page?: number;
      page_size?: number;
    } = {}): CableListResponse {
      let filtered = [...cables];
      if (params.q) {
        const q = params.q.toLowerCase();
        filtered = filtered.filter(c =>
          c.brand.toLowerCase().includes(q) ||
          c.model.toLowerCase().includes(q) ||
          c.spec.toLowerCase().includes(q)
        );
      }
      if (params.awg) filtered = filtered.filter(c => c.awg === params.awg);
      if (params.brand) filtered = filtered.filter(c => c.brand_slug === params.brand);
      if (params.shielding) filtered = filtered.filter(c => c.shielding === params.shielding);
      if (params.jacket) filtered = filtered.filter(c => c.jacket === params.jacket);
      if (params.core_structure) filtered = filtered.filter(c => c.core_structure === params.core_structure);
      if (params.conductor_area_min !== undefined) filtered = filtered.filter(c => c.conductor_area >= params.conductor_area_min!);
      if (params.conductor_area_max !== undefined) filtered = filtered.filter(c => c.conductor_area <= params.conductor_area_max!);
      if (params.outer_diameter_min !== undefined) filtered = filtered.filter(c => c.outer_diameter >= params.outer_diameter_min!);
      if (params.outer_diameter_max !== undefined) filtered = filtered.filter(c => c.outer_diameter <= params.outer_diameter_max!);

      const total = filtered.length;
      const page = params.page || 1;
      const page_size = params.page_size || 20;
      const start = (page - 1) * page_size;
      const items = filtered.slice(start, start + page_size).map(toListItem);
      return { items, total, page, page_size };
    },
    getBySlug(brandSlug: string, slug: string): Cable | null {
      return cables.find(c => c.brand_slug === brandSlug && c.slug === slug) || null;
    },
    getById(id: string): Cable | null {
      return cables.find(c => c.id === id) || null;
    },
    sitemap(): { brand_slug: string; slug: string; updated_at: string }[] {
      return cables.map(c => ({
        brand_slug: c.brand_slug,
        slug: c.slug,
        updated_at: new Date().toISOString(),
      }));
    },
    allBrands(): { name: string; slug: string }[] {
      const seen = new Map<string, string>();
      cables.forEach(c => seen.set(c.brand_slug, c.brand));
      return Array.from(seen.entries()).map(([slug, name]) => ({ name, slug }));
    },
  },

  equipments: {
    list(params: {
      q?: string;
      brand?: string;
      equipment_type?: string;
      page?: number;
      page_size?: number;
    } = {}): EquipmentListResponse {
      let filtered = [...equipments];
      if (params.q) {
        const q = params.q.toLowerCase();
        filtered = filtered.filter(e =>
          e.brand.toLowerCase().includes(q) ||
          e.model.toLowerCase().includes(q)
        );
      }
      if (params.brand) filtered = filtered.filter(e => e.brand_slug === params.brand);
      if (params.equipment_type) filtered = filtered.filter(e => e.equipment_type === params.equipment_type);

      const total = filtered.length;
      const page = params.page || 1;
      const page_size = params.page_size || 20;
      const start = (page - 1) * page_size;
      const items = filtered.slice(start, start + page_size).map(toEquipListItem);
      return { items, total, page, page_size };
    },
    getBySlug(brandSlug: string, slug: string): Equipment | null {
      return equipments.find(e => e.brand_slug === brandSlug && e.slug === slug) || null;
    },
    sitemap(): { brand_slug: string; slug: string; updated_at: string }[] {
      return equipments.map(e => ({
        brand_slug: e.brand_slug,
        slug: e.slug,
        updated_at: new Date().toISOString(),
      }));
    },
  },

  matchRules: {
    list(): MatchRule[] {
      return matchRules;
    },
    byType(equipmentType: string): MatchRule[] {
      return matchRules.filter(r => r.equipment_type === equipmentType);
    },
  },

  config: {
    matchTopN: MATCH_TOP_N,
    matchScoreThreshold: MATCH_SCORE_THRESHOLD,
  },
};
