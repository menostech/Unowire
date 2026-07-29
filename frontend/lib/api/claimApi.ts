export interface ManufacturerSearchResult {
  id: string;
  name: string;
  slug: string;
  type: 'cable' | 'equipment';
}

export interface ClaimRequestCreate {
  manufacturer_type: 'cable' | 'equipment';
  manufacturer_id: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  proof_description: string;
}

export class ClaimApiError extends Error {
  constructor(
    public status: number,
    public code: number,
    message: string,
  ) {
    super(message);
    this.name = 'ClaimApiError';
  }
}

export async function searchManufacturers(q: string): Promise<ManufacturerSearchResult[]> {
  const res = await fetch(`/api/portal/claim/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ClaimApiError(res.status, data.code ?? res.status, data.message ?? 'Search failed');
  }
  return res.json();
}

export async function submitClaim(data: ClaimRequestCreate): Promise<{ id: string }> {
  const res = await fetch('/api/portal/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new ClaimApiError(res.status, errorData.code ?? res.status, errorData.message ?? 'Submission failed');
  }
  return res.json();
}
