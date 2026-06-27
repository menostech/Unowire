import type {
  Cable, Equipment, MatchRule, MatchedRule, MatchResultItem, MatchTypeResult, MatchResponse,
} from './types';
import { api } from './api';

interface CableMatchInput {
  conductor_area: number;
  outer_diameter: number;
  shielding: string;
  jacket: string;
  core_structure: string;
}

function evaluateRange(cableValue: number, equipMin: number, equipMax: number): boolean {
  return equipMin <= cableValue && cableValue <= equipMax;
}

function evaluateIn(cableValue: string, equipList: string[]): boolean {
  return equipList.includes(cableValue);
}

function getCableValue(cable: CableMatchInput, field: string, cutLength: number | null): number | string | null {
  if (field === 'cut_length') return cutLength;
  return (cable as any)[field] ?? null;
}

function getEquipmentValue(eq: Equipment, equipmentField: string): { min?: number; max?: number; list?: string[] } {
  if (equipmentField.includes(',')) {
    const [minField, maxField] = equipmentField.split(',');
    return { min: (eq as any)[minField], max: (eq as any)[maxField] };
  }
  return { list: (eq as any)[equipmentField] as string[] };
}

function evaluateRule(rule: MatchRule, cable: CableMatchInput, eq: Equipment, cutLength: number | null): MatchedRule {
  if (rule.cable_field === 'cut_length' && cutLength === null) {
    return {
      cable_field: rule.cable_field,
      operator: rule.operator,
      passed: true,
      required: rule.is_required,
      weight: 0, // excluded from scoring
      skipped: true,
    };
  }

  const cableValue = getCableValue(cable, rule.cable_field, cutLength);
  const equipValue = getEquipmentValue(eq, rule.equipment_field);

  let passed = false;
  if (rule.operator === 'range' && cableValue !== null && equipValue.min !== undefined && equipValue.max !== undefined) {
    passed = evaluateRange(Number(cableValue), equipValue.min, equipValue.max);
  } else if (rule.operator === 'in' && cableValue !== null && equipValue.list) {
    passed = evaluateIn(String(cableValue), equipValue.list);
  }

  return {
    cable_field: rule.cable_field,
    operator: rule.operator,
    passed,
    required: rule.is_required,
    weight: rule.weight,
    skipped: false,
  };
}

function calculateScore(results: MatchedRule[]): number {
  const active = results.filter(r => !r.skipped);
  if (active.length === 0) return 0;
  const total = active.reduce((sum, r) => sum + r.weight, 0);
  if (total === 0) return 0;
  const passed = active.filter(r => r.passed).reduce((sum, r) => sum + r.weight, 0);
  return passed / total;
}

function hasFailedRequired(results: MatchedRule[]): boolean {
  return results.some(r => r.required && !r.passed && !r.skipped);
}

function buildExplanation(results: MatchedRule[]): string {
  const failedReq = results.filter(r => r.required && !r.passed && !r.skipped);
  if (failedReq.length > 0) {
    return 'Failed required rules: ' + failedReq.map(r => r.cable_field).join(', ');
  }
  const parts = results
    .filter(r => !r.skipped)
    .map(r => `${r.cable_field}: ${r.passed ? 'PASS' : 'FAIL'} (${r.required ? 'required' : 'optional'})`);
  return 'All required rules passed. ' + parts.join('; ');
}

function matchEquipmentType(
  equipmentType: string,
  cable: CableMatchInput,
  cutLength: number | null,
  topN: number,
  scoreThreshold: number,
): MatchResultItem[] {
  const rules = api.matchRules.byType(equipmentType);
  if (rules.length === 0) return [];

  // Get all equipments of this type
  const candidates = api.equipments.list({ equipment_type: equipmentType, page_size: 1000 }).items
    .map(item => api.equipments.getBySlug(item.brand_slug, item.slug)!)
    .filter(Boolean);

  // Phase 1+2: Evaluate all rules for each candidate
  const scored: MatchResultItem[] = [];
  for (const eq of candidates) {
    const ruleResults = rules.map(r => evaluateRule(r, cable, eq, cutLength));

    // Phase 1 check: if any required rule failed, eliminate
    if (hasFailedRequired(ruleResults)) continue;

    // Phase 2: score
    const score = calculateScore(ruleResults);
    if (scoreThreshold > 0 && score < scoreThreshold) continue;

    scored.push({
      equipment: eq,
      score: Math.round(score * 10000) / 10000,
      failed_required: false,
      matched_rules: ruleResults,
      explanation: buildExplanation(ruleResults),
    });
  }

  // Phase 3: rank and return top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}

export function runMatch(params: {
  cable?: Cable | null;
  cableParams?: CableMatchInput;
  cutLength?: number | null;
  equipmentTypes: string[];
  topN?: number;
}): MatchResponse {
  const topN = params.topN || api.config.matchTopN;
  const threshold = api.config.matchScoreThreshold;

  let cableInput: CableMatchInput;
  if (params.cable) {
    cableInput = {
      conductor_area: params.cable.conductor_area,
      outer_diameter: params.cable.outer_diameter,
      shielding: params.cable.shielding,
      jacket: params.cable.jacket,
      core_structure: params.cable.core_structure,
    };
  } else if (params.cableParams) {
    cableInput = params.cableParams;
  } else {
    return { cable: null, results: [] };
  }

  const results: MatchTypeResult[] = params.equipmentTypes.map(et => ({
    equipment_type: et,
    matches: matchEquipmentType(et, cableInput, params.cutLength ?? null, topN, threshold),
  }));

  return { cable: params.cable || null, results };
}
