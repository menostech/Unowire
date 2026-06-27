export interface Manufacturer {
  id: string;
  name: string;
  slug: string;
  type: string;
  country: string | null;
  website: string | null;
  description: string | null;
}

export interface Cable {
  id: string;
  manufacturer_id: string;
  brand: string;
  brand_slug: string;
  model: string;
  slug: string;
  spec: string;
  awg: string | null;
  conductor_area: number;
  outer_diameter: number;
  insulation_material: string | null;
  shielding: string;
  jacket: string;
  core_structure: string;
  rated_voltage: string | null;
  temperature_rating: string | null;
  description: string | null;
  meta_title: string | null;
  meta_description: string | null;
}

export interface CableListItem {
  id: string;
  brand: string;
  brand_slug: string;
  model: string;
  slug: string;
  spec: string;
  awg: string | null;
  conductor_area: number;
  outer_diameter: number;
  shielding: string;
  jacket: string;
  core_structure: string;
}

export interface Equipment {
  id: string;
  manufacturer_id: string;
  brand: string;
  brand_slug: string;
  model: string;
  slug: string;
  equipment_type: string;
  automation_level: string;
  conductor_area_min: number;
  conductor_area_max: number;
  outer_diameter_min: number;
  outer_diameter_max: number;
  cut_length_min: number | null;
  cut_length_max: number | null;
  supported_shieldings: string[];
  supported_jackets: string[];
  supported_cores: string[];
  image_url: string | null;
  spec_pdf_url: string | null;
  description: string | null;
  meta_title: string | null;
  meta_description: string | null;
}

export interface EquipmentListItem {
  id: string;
  brand: string;
  brand_slug: string;
  model: string;
  slug: string;
  equipment_type: string;
  automation_level: string;
  conductor_area_min: number;
  conductor_area_max: number;
}

export interface MatchRule {
  equipment_type: string;
  cable_field: string;
  operator: string;
  equipment_field: string;
  weight: number;
  is_required: boolean;
  description: string;
}

export interface MatchedRule {
  cable_field: string;
  operator: string;
  passed: boolean;
  required: boolean;
  weight: number;
  skipped: boolean;
}

export interface MatchResultItem {
  equipment: Equipment;
  score: number;
  failed_required: boolean;
  matched_rules: MatchedRule[];
  explanation: string;
}

export interface MatchTypeResult {
  equipment_type: string;
  matches: MatchResultItem[];
}

export interface MatchResponse {
  cable: Cable | null;
  results: MatchTypeResult[];
}

export interface CableListResponse {
  items: CableListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface EquipmentListResponse {
  items: EquipmentListItem[];
  total: number;
  page: number;
  page_size: number;
}
