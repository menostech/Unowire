import { api } from './api';
import type { Category } from './types';

/** 获取某分类的所有子孙 ID（含自身） */
export function getDescendantIds(catId: string): Set<string> {
  const descendants = api.categories.descendants(catId);
  return new Set([catId, ...descendants]);
}

/** 获取分类的祖先链（从根到自身） */
export function getCategoryPath(catId: string): Category[] {
  return api.categories.ancestors(catId);
}

/** 获取分类的 URL slug 路径数组 */
export function getCategoryPathSlugs(catId: string): string[] {
  return api.categories.pathSlugs(catId);
}

/** 构建分类的 URL */
export function getCategoryUrl(catId: string): string {
  const slugs = getCategoryPathSlugs(catId);
  return `/categories/${slugs.join('/')}`;
}

/** 判断一个 cable 是否属于某分类（含子孙） */
export function cableInCategory(cableCategoryIds: string[], catId: string): boolean {
  const allIds = getDescendantIds(catId);
  return cableCategoryIds.some(id => allIds.has(id));
}
