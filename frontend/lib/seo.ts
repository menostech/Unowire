import type { Metadata } from 'next';
import type { Cable, Equipment, Manufacturer } from './types';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.unowire.com';

export function generateCableMetadata(cable: Cable): Metadata {
  const title = cable.meta_title || `${cable.spec} | ${cable.brand} | Unowire`;
  const description = cable.meta_description ||
    (cable.description?.slice(0, 160)) ||
    `${cable.spec} wire: ${cable.conductor_area}mm² conductor, ${cable.outer_diameter}mm OD, ${cable.shielding} shielding, ${cable.jacket} jacket.`;
  const url = `${SITE_URL}/cables/${cable.brand_slug}/${cable.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, type: 'website', url },
    robots: { index: true, follow: true },
  };
}

export function generateEquipmentMetadata(eq: Equipment): Metadata {
  const title = eq.meta_title || `${eq.brand} ${eq.model} | Unowire`;
  const description = eq.meta_description ||
    (eq.description?.slice(0, 160)) ||
    `${eq.brand} ${eq.model}: ${eq.conductor_area_min}-${eq.conductor_area_max}mm² capacity.`;
  const url = `${SITE_URL}/equipments/${eq.brand_slug}/${eq.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, type: 'website', url },
    robots: { index: true, follow: true },
  };
}

export function generateManufacturerMetadata(mfr: Manufacturer): Metadata {
  const title = `${mfr.name} | Unowire`;
  const description = mfr.description?.slice(0, 160) || `${mfr.name} manufacturer directory.`;
  const url = `${SITE_URL}/manufacturers/${mfr.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, type: 'website', url },
    robots: { index: true, follow: true },
  };
}

export function buildCableJsonLd(cable: Cable) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: cable.spec,
    brand: { '@type': 'Brand', name: cable.brand },
    description: cable.description || cable.spec,
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'AWG', value: cable.awg },
      { '@type': 'PropertyValue', name: 'Conductor Area', value: `${cable.conductor_area} mm²` },
      { '@type': 'PropertyValue', name: 'Outer Diameter', value: `${cable.outer_diameter} mm` },
      { '@type': 'PropertyValue', name: 'Insulation', value: cable.insulation_material },
      { '@type': 'PropertyValue', name: 'Shielding', value: cable.shielding },
      { '@type': 'PropertyValue', name: 'Jacket', value: cable.jacket },
      { '@type': 'PropertyValue', name: 'Core Structure', value: cable.core_structure },
      { '@type': 'PropertyValue', name: 'Rated Voltage', value: cable.rated_voltage },
      { '@type': 'PropertyValue', name: 'Temperature Rating', value: cable.temperature_rating },
    ],
  };
}

export function buildEquipmentJsonLd(eq: Equipment) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${eq.brand} ${eq.model}`,
    brand: { '@type': 'Brand', name: eq.brand },
    description: eq.description || `${eq.brand} ${eq.model}`,
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Equipment Type', value: eq.equipment_type },
      { '@type': 'PropertyValue', name: 'Automation', value: eq.automation_level },
      { '@type': 'PropertyValue', name: 'Conductor Area Range', value: `${eq.conductor_area_min}-${eq.conductor_area_max} mm²` },
      { '@type': 'PropertyValue', name: 'OD Range', value: `${eq.outer_diameter_min}-${eq.outer_diameter_max} mm` },
      { '@type': 'PropertyValue', name: 'Cut Length Range', value: `${eq.cut_length_min}-${eq.cut_length_max} mm` },
      { '@type': 'PropertyValue', name: 'Supported Shieldings', value: eq.supported_shieldings.join(', ') },
      { '@type': 'PropertyValue', name: 'Supported Jackets', value: eq.supported_jackets.join(', ') },
      { '@type': 'PropertyValue', name: 'Supported Cores', value: eq.supported_cores.join(', ') },
    ],
  };
}

export function buildManufacturerJsonLd(mfr: Manufacturer) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: mfr.name,
    url: mfr.website || undefined,
    description: mfr.description || undefined,
    address: mfr.country ? { '@type': 'PostalAddress', addressCountry: mfr.country } : undefined,
  };
}

export function buildBreadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.url}`,
    })),
  };
}
