import type { Metadata } from 'next';
import type {
  Cable, Category, Manufacturer, Brand,
  TaxonomyIndustry, TaxonomyCategory, ProductTypeConfig,
} from './types';
import { api } from './api';
import { findSpecItem, getPrimaryVariant } from './utils';
import { getCategoryPathSlugs } from './category-tree';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.unowire.com';

// === Cable Metadata ===
export function generateCableMetadata(cable: Cable, brand: Brand | null): Metadata {
  const title = cable.meta_title || `${cable.model} - ${brand?.name ?? "Unknown"}`;
  const description = cable.meta_description || cable.base_description.slice(0, 160);
  const brandSlug = brand?.slug ?? "unknown";
  return {
    title,
    description,
    alternates: { canonical: `/cables/${brandSlug}/${cable.slug}` },
    robots: { index: true, follow: true },
  };
}

// === Taxonomy Metadata ===
export function generateIndustryMetadata(industry: TaxonomyIndustry): Metadata {
  return {
    title: `${industry.label} Cables`,
    description: industry.description,
    alternates: { canonical: `/cables/${industry.slug}` },
    robots: { index: true, follow: true },
  };
}

export function generateCategoryMetadata(
  industry: TaxonomyIndustry,
  category: TaxonomyCategory
): Metadata {
  return {
    title: `${category.label} | ${industry.label} Cables`,
    description: `Browse ${category.label.toLowerCase()} cables for ${industry.label.toLowerCase()} applications.`,
    alternates: { canonical: `/cables/${industry.slug}/${category.slug}` },
    robots: { index: true, follow: true },
  };
}

export function generateProductTypeMetadata(
  industry: TaxonomyIndustry,
  category: TaxonomyCategory,
  productType: ProductTypeConfig
): Metadata {
  const filterLabels = productType.filters.map(f => f.label.toLowerCase()).join(', ');
  return {
    title: `${productType.label} | ${category.label} | ${industry.label}`,
    description: `Browse ${productType.label.toLowerCase()} cables. Filter by ${filterLabels}.`,
    alternates: { canonical: `/cables/${industry.slug}/${category.slug}/${productType.slug}` },
    robots: { index: true, follow: true },
  };
}

// === Home Metadata ===
export function generateHomeMetadata(): Metadata {
  return {
    title: { absolute: 'Unowire - Cable Specs Database' },
    description: 'Query cable specifications online. Browse cables by brand, category, and specs.',
    alternates: { canonical: '/' },
    robots: { index: true, follow: true },
  };
}

// === Cables Overview Metadata ===
export function generateCablesListMetadata(): Metadata {
  return {
    title: 'Cable Directory',
    description: 'Browse cables by industry. Select an industry to explore its categories and product types.',
    alternates: { canonical: '/cables' },
    robots: { index: true, follow: true },
  };
}

// === JSON-LD: Product ===
export function buildCableJsonLd(cable: Cable, brand: Brand | null, manufacturer: Manufacturer | null): object {
  // additionalProperty: common_specs + 主变体 specs
  const primaryVariant = getPrimaryVariant(cable);
  const additionalProperty: object[] = cable.common_specs.map(s => ({
    "@type": "PropertyValue",
    name: s.label,
    value: s.unit ? `${s.value} ${s.unit}` : String(s.value),
  }));
  if (primaryVariant) {
    for (const s of primaryVariant.specs) {
      additionalProperty.push({
        "@type": "PropertyValue",
        name: s.label,
        value: s.unit ? `${s.value} ${s.unit}` : String(s.value),
      });
    }
  }

  // category 路径
  const categoryPath = cable.category_ids.length > 0
    ? api.categories.getByIds(cable.category_ids).map(c => c.name).join(" > ")
    : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: cable.model,
    description: cable.base_description,
    brand: brand ? { "@type": "Brand", name: brand.name } : undefined,
    manufacturer: manufacturer ? {
      "@type": "Organization",
      name: manufacturer.name,
      address: { "@type": "PostalAddress", addressCountry: manufacturer.country },
    } : undefined,
    category: categoryPath,
    additionalProperty,
  };
}

// === JSON-LD: BreadcrumbList ===
export function buildBreadcrumbJsonLd(items: { name: string; url: string }[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.url}`,
    })),
  };
}
