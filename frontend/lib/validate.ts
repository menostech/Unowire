import { api } from './api';
import type { ValidationError } from './types';

/**
 * 校验所有 JSON 数据的引用完整性、key 唯一性、slug 唯一性。
 * 在 dev 启动和 build 前运行。
 */
export function validateAllData(): ValidationError[] {
  const errors: ValidationError[] = [];
  const brands = api.brands.all();
  const manufacturers = api.manufacturers.all();
  const categories = api.categories.all();
  const cables = api.cables.all();
  const equipments = api.recommendedEquipments.all();

  const brandIds = new Set(brands.map(b => b.id));
  const manufacturerIds = new Set(manufacturers.map(m => m.id));
  const categoryIds = new Set(categories.map(c => c.id));

  // 1. brand.manufacturer_id 引用完整性
  for (const brand of brands) {
    if (!manufacturerIds.has(brand.manufacturer_id)) {
      errors.push({
        file: "brands.json",
        message: `Brand ${brand.id} references missing manufacturer_id: ${brand.manufacturer_id}`,
        severity: "error",
      });
    }
  }

  // 2. cable.brand_id 引用完整性
  for (const cable of cables) {
    if (!brandIds.has(cable.brand_id)) {
      errors.push({
        file: "cables.json",
        cable_id: cable.id,
        message: `Cable ${cable.id} references missing brand_id: ${cable.brand_id}`,
        severity: "error",
      });
    }

    // 3. cable.category_ids 引用完整性
    for (const catId of cable.category_ids) {
      if (!categoryIds.has(catId)) {
        errors.push({
          file: "cables.json",
          cable_id: cable.id,
          message: `Cable ${cable.id} references missing category_id: ${catId}`,
          severity: "error",
        });
      }
    }

    // 4. common_specs 与 variant specs 无同名 key
    const commonKeys = new Set(cable.common_specs.map(s => s.key));
    for (const variant of cable.variants) {
      const variantKeys = new Set(variant.specs.map(s => s.key));
      for (const k of variantKeys) {
        if (commonKeys.has(k)) {
          errors.push({
            file: "cables.json",
            cable_id: cable.id,
            message: `Cable ${cable.id} variant ${variant.slug}: spec key "${k}" duplicated in common_specs`,
            severity: "error",
          });
        }
      }
    }

    // 5. variant 内 spec key 唯一
    for (const variant of cable.variants) {
      const keys = variant.specs.map(s => s.key);
      const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
      if (dup.length > 0) {
        errors.push({
          file: "cables.json",
          cable_id: cable.id,
          message: `Cable ${cable.id} variant ${variant.slug}: duplicate spec keys: ${dup.join(", ")}`,
          severity: "error",
        });
      }
    }

    // 5b. industry + size_system presence and validity
    const validIndustries = new Set(api.filterConfig.industries());
    const validSizeSystems = new Set(["awg", "mm2", "kcmil", "none"]);
    if (!cable.industry) {
      errors.push({
        file: "cables.json",
        cable_id: cable.id,
        message: `Cable ${cable.id} missing required field: industry`,
        severity: "error",
      });
    } else if (!validIndustries.has(cable.industry)) {
      errors.push({
        file: "cables.json",
        cable_id: cable.id,
        message: `Cable ${cable.id} has invalid industry "${cable.industry}". Valid: ${Array.from(validIndustries).join(", ")}`,
        severity: "error",
      });
    }
    if (!cable.size_system) {
      errors.push({
        file: "cables.json",
        cable_id: cable.id,
        message: `Cable ${cable.id} missing required field: size_system`,
        severity: "error",
      });
    } else if (!validSizeSystems.has(cable.size_system)) {
      errors.push({
        file: "cables.json",
        cable_id: cable.id,
        message: `Cable ${cable.id} has invalid size_system "${cable.size_system}". Valid: awg, mm2, kcmil, none`,
        severity: "error",
      });
    }

    // 5c. size spec presence consistency with size_system
    if (cable.size_system && cable.size_system !== "none") {
      for (const variant of cable.variants) {
        const hasSize = variant.specs.some(s => s.key === "size");
        if (!hasSize) {
          errors.push({
            file: "cables.json",
            cable_id: cable.id,
            message: `Cable ${cable.id} variant ${variant.slug}: missing "size" spec but size_system is "${cable.size_system}"`,
            severity: "error",
          });
        }
      }
    } else if (cable.size_system === "none") {
      for (const variant of cable.variants) {
        const hasSize = variant.specs.some(s => s.key === "size");
        if (hasSize) {
          errors.push({
            file: "cables.json",
            cable_id: cable.id,
            message: `Cable ${cable.id} variant ${variant.slug}: has "size" spec but size_system is "none"`,
            severity: "error",
          });
        }
      }
    }

    // 5d. type must exist in filter-config.json
    if (cable.industry && validIndustries.has(cable.industry)) {
      const indCfg = api.filterConfig.byIndustry(cable.industry);
      if (indCfg && !indCfg.types[cable.type]) {
        errors.push({
          file: "cables.json",
          cable_id: cable.id,
          message: `Cable ${cable.id} type "${cable.type}" not found in filter-config.json under industry "${cable.industry}"`,
          severity: "error",
        });
      }
    }
  }

  // 6. (brand_slug, cable_slug) 组合唯一
  const urlSet = new Set<string>();
  for (const cable of cables) {
    const brand = api.brands.getById(cable.brand_id);
    if (brand) {
      const urlKey = `${brand.slug}/${cable.slug}`;
      if (urlSet.has(urlKey)) {
        errors.push({
          file: "cables.json",
          cable_id: cable.id,
          message: `Duplicate cable URL: ${urlKey}`,
          severity: "error",
        });
      }
      urlSet.add(urlKey);
    }
  }

  // 7. type 一致性：同一 spec_key 在所有 cable 中 type 一致
  const keyTypes = new Map<string, string>();
  function checkType(file: string, cableId: string, key: string, type: string) {
    const existing = keyTypes.get(key);
    if (existing === undefined) {
      keyTypes.set(key, type);
    } else if (existing !== type) {
      errors.push({
        file,
        cable_id: cableId,
        message: `Spec key "${key}" has inconsistent types: ${existing} vs ${type}`,
        severity: "error",
      });
    }
  }
  for (const cable of cables) {
    for (const s of cable.common_specs) checkType("cables.json", cable.id, s.key, s.type);
    for (const v of cable.variants) {
      for (const s of v.specs) checkType("cables.json", cable.id, s.key, s.type);
    }
  }

  // 8. 推荐设备覆盖（warning，不阻断）
  for (const eq of equipments) {
    // 简单检查：至少能匹配一个 cable 的任一变体（不做完整匹配，只检查 spec_key 存在性）
    const ruleKeys = eq.applicable_specs.map(r => r.spec_key);
    let anyCableHasAllKeys = false;
    for (const cable of cables) {
      const allSpecKeys = new Set([
        ...cable.common_specs.map(s => s.key),
        ...cable.variants.flatMap(v => v.specs.map(s => s.key)),
      ]);
      if (ruleKeys.every(k => allSpecKeys.has(k))) {
        anyCableHasAllKeys = true;
        break;
      }
    }
    if (!anyCableHasAllKeys) {
      errors.push({
        file: "recommended-equipments.json",
        message: `Equipment ${eq.id} (${eq.model}): no cable has all spec_keys [${ruleKeys.join(", ")}], will never match`,
        severity: "warning",
      });
    }
  }

  return errors;
}

/** 打印校验结果，返回是否有 error 级别问题 */
export function printValidationResult(errors: ValidationError[]): boolean {
  const errorsOnly = errors.filter(e => e.severity === "error");
  const warnings = errors.filter(e => e.severity === "warning");
  if (errorsOnly.length > 0) {
    console.error("\n❌ Data validation errors:");
    for (const e of errorsOnly) {
      console.error(`  [${e.file}]${e.cable_id ? ` ${e.cable_id}:` : ""} ${e.message}`);
    }
  }
  if (warnings.length > 0) {
    console.warn("\n⚠️ Data validation warnings:");
    for (const w of warnings) {
      console.warn(`  [${w.file}]${w.cable_id ? ` ${w.cable_id}:` : ""} ${w.message}`);
    }
  }
  if (errorsOnly.length === 0 && warnings.length === 0) {
    console.log("✓ Data validation passed.");
  }
  return errorsOnly.length > 0;
}
