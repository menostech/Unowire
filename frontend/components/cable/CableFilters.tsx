'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export function CableFilters({ brands }: { brands: { name: string; slug: string }[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [areaMin, setAreaMin] = useState(searchParams.get('conductor_area_min') || '');
  const [areaMax, setAreaMax] = useState(searchParams.get('conductor_area_max') || '');
  const [odMin, setOdMin] = useState(searchParams.get('outer_diameter_min') || '');
  const [odMax, setOdMax] = useState(searchParams.get('outer_diameter_max') || '');

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.set('page', '1');
    router.push(`/cables?${params.toString()}`);
  }

  function applyRange() {
    const params = new URLSearchParams(searchParams.toString());
    if (areaMin) params.set('conductor_area_min', areaMin); else params.delete('conductor_area_min');
    if (areaMax) params.set('conductor_area_max', areaMax); else params.delete('conductor_area_max');
    if (odMin) params.set('outer_diameter_min', odMin); else params.delete('outer_diameter_min');
    if (odMax) params.set('outer_diameter_max', odMax); else params.delete('outer_diameter_max');
    params.set('page', '1');
    router.push(`/cables?${params.toString()}`);
  }

  return (
    <aside className="w-full md:w-64 space-y-6">
      <div>
        <h3 className="font-semibold mb-2 text-gray-900">Brand</h3>
        <select
          onChange={e => updateParam('brand', e.target.value)}
          defaultValue={searchParams.get('brand') || ''}
          className="w-full border border-gray-300 rounded p-2 text-sm"
        >
          <option value="">All Brands</option>
          {brands.map(b => (
            <option key={b.slug} value={b.slug}>{b.name}</option>
          ))}
        </select>
      </div>

      <div>
        <h3 className="font-semibold mb-2 text-gray-900">AWG</h3>
        <select
          onChange={e => updateParam('awg', e.target.value)}
          defaultValue={searchParams.get('awg') || ''}
          className="w-full border border-gray-300 rounded p-2 text-sm"
        >
          <option value="">All AWG</option>
          {['26', '24', '22', '20', '18', '16', '14'].map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      <div>
        <h3 className="font-semibold mb-2 text-gray-900">Cross-section (mm²)</h3>
        <div className="flex gap-2">
          <input
            type="number"
            step="0.01"
            placeholder="Min"
            value={areaMin}
            onChange={e => setAreaMin(e.target.value)}
            className="w-1/2 border border-gray-300 rounded p-2 text-sm"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Max"
            value={areaMax}
            onChange={e => setAreaMax(e.target.value)}
            className="w-1/2 border border-gray-300 rounded p-2 text-sm"
          />
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-2 text-gray-900">OD (mm)</h3>
        <div className="flex gap-2">
          <input
            type="number"
            step="0.01"
            placeholder="Min"
            value={odMin}
            onChange={e => setOdMin(e.target.value)}
            className="w-1/2 border border-gray-300 rounded p-2 text-sm"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Max"
            value={odMax}
            onChange={e => setOdMax(e.target.value)}
            className="w-1/2 border border-gray-300 rounded p-2 text-sm"
          />
        </div>
      </div>

      <button
        onClick={applyRange}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
      >
        Apply Range
      </button>

      <div>
        <h3 className="font-semibold mb-2 text-gray-900">Shielding</h3>
        <select
          onChange={e => updateParam('shielding', e.target.value)}
          defaultValue={searchParams.get('shielding') || ''}
          className="w-full border border-gray-300 rounded p-2 text-sm"
        >
          <option value="">All</option>
          <option value="none">None</option>
          <option value="braided">Braided</option>
          <option value="spiral">Spiral</option>
          <option value="foil">Foil</option>
        </select>
      </div>

      <div>
        <h3 className="font-semibold mb-2 text-gray-900">Jacket</h3>
        <select
          onChange={e => updateParam('jacket', e.target.value)}
          defaultValue={searchParams.get('jacket') || ''}
          className="w-full border border-gray-300 rounded p-2 text-sm"
        >
          <option value="">All</option>
          <option value="none">None</option>
          <option value="pvc">PVC</option>
          <option value="pu">PU</option>
          <option value="lszh">LSZH</option>
        </select>
      </div>

      <div>
        <h3 className="font-semibold mb-2 text-gray-900">Core Structure</h3>
        <select
          onChange={e => updateParam('core_structure', e.target.value)}
          defaultValue={searchParams.get('core_structure') || ''}
          className="w-full border border-gray-300 rounded p-2 text-sm"
        >
          <option value="">All</option>
          <option value="single">Single Core</option>
          <option value="2_core">2 Core</option>
          <option value="3_core">3 Core</option>
          <option value="4_core">4 Core</option>
          <option value="multi_core">Multi Core</option>
        </select>
      </div>
    </aside>
  );
}
