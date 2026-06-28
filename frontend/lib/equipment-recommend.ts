import type {
  ApplicableSpecRule, Cable, CableVariant, RecommendedEquipment,
  RecommendedEquipmentResult, SpecItem,
} from './types';

/** 从 variant.specs + common_specs 中查找指定 key 的 SpecItem */
function findSpec(variant: CableVariant, commonSpecs: SpecItem[], key: string): SpecItem | undefined {
  return [...variant.specs, ...commonSpecs].find(s => s.key === key);
}

/** 判断单个变体是否满足单条规则 */
function variantMatchesRule(variant: CableVariant, commonSpecs: SpecItem[], rule: ApplicableSpecRule): boolean {
  const spec = findSpec(variant, commonSpecs, rule.spec_key);
  if (!spec) return false;
  if (rule.min !== undefined && typeof spec.value === "number" && spec.value < rule.min) return false;
  if (rule.max !== undefined && typeof spec.value === "number" && spec.value > rule.max) return false;
  if (rule.allowed_values && !rule.allowed_values.includes(spec.value)) return false;
  return true;
}

/** 判断单个变体是否满足所有规则 */
function variantMatchesAllRules(variant: CableVariant, commonSpecs: SpecItem[], rules: ApplicableSpecRule[]): boolean {
  return rules.every(rule => variantMatchesRule(variant, commonSpecs, rule));
}

/**
 * 推荐设备匹配：任一变体命中即推荐该设备（去重）。
 * @returns 匹配结果数组，每项含设备、命中的变体列表、explanation
 */
export function recommendEquipments(
  cable: Cable,
  equipments: RecommendedEquipment[],
): RecommendedEquipmentResult[] {
  const results: RecommendedEquipmentResult[] = [];
  for (const eq of equipments) {
    const matchedVariants: CableVariant[] = [];
    for (const variant of cable.variants) {
      if (variantMatchesAllRules(variant, cable.common_specs, eq.applicable_specs)) {
        matchedVariants.push(variant);
      }
    }
    if (matchedVariants.length === 0) continue;

    // explanation: 取主变体（第一个命中变体）命中的所有规则
    const primaryVariant = matchedVariants[0];
    const explanation = eq.applicable_specs.map(rule => {
      const spec = findSpec(primaryVariant, cable.common_specs, rule.spec_key);
      return {
        spec_key: rule.spec_key,
        label: spec?.label ?? rule.spec_key,
        matched_value: spec?.value ?? "N/A",
      };
    });

    results.push({ equipment: eq, matched_variants: matchedVariants, explanation });
  }
  return results;
}
