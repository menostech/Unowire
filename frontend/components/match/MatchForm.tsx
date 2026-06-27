'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { runMatch } from '@/lib/mock-match';
import type { MatchResponse } from '@/lib/types';
import { MatchResultCard } from './MatchResultCard';
import { formatEquipmentType } from '@/lib/utils';

const EQUIPMENT_TYPES = [
  { value: 'semi_auto_stripping', label: 'Semi-Auto Stripping Machine' },
  { value: 'fully_auto_cutting_stripping', label: 'Fully-Auto Cutting & Stripping Machine' },
];

function MatchFormContent() {
  const searchParams = useSearchParams();
  const cableId = searchParams.get('cable_id');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    conductor_area: '',
    outer_diameter: '',
    cut_length: '',
    shielding: 'none',
    jacket: 'pvc',
    core_structure: 'single',
  });
  const [selectedTypes, setSelectedTypes] = useState<Record<string, boolean>>({
    semi_auto_stripping: true,
    fully_auto_cutting_stripping: true,
  });

  // Pre-fill from cable_id and auto-match
  useEffect(() => {
    if (!cableId) return;
    const cable = api.cables.getById(cableId);
    if (!cable) {
      setError('Cable not found.');
      return;
    }
    setForm({
      conductor_area: String(cable.conductor_area),
      outer_diameter: String(cable.outer_diameter),
      cut_length: '',
      shielding: cable.shielding,
      jacket: cable.jacket,
      core_structure: cable.core_structure,
    });
    setLoading(true);
    setError(null);
    // Run match with cable object
    const types = Object.keys(selectedTypes).filter(k => selectedTypes[k]);
    const r = runMatch({ cable, equipmentTypes: types });
    setResult(r);
    setLoading(false);
  }, [cableId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const types = Object.keys(selectedTypes).filter(k => selectedTypes[k]);
      if (types.length === 0) {
        setError('Please select at least one equipment type.');
        setLoading(false);
        return;
      }
      const cableParams = {
        conductor_area: parseFloat(form.conductor_area),
        outer_diameter: parseFloat(form.outer_diameter),
        shielding: form.shielding,
        jacket: form.jacket,
        core_structure: form.core_structure,
      };
      const r = runMatch({
        cableParams,
        cutLength: form.cut_length ? parseFloat(form.cut_length) : null,
        equipmentTypes: types,
      });
      setResult(r);
    } catch (err) {
      setError('Failed to run match. Please check your inputs.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="border border-gray-200 rounded-lg p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Cable Parameters</h2>
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Conductor Area (mm²) *
            </label>
            <input
              type="number"
              step="0.001"
              required
              value={form.conductor_area}
              onChange={e => setForm({ ...form, conductor_area: e.target.value })}
              className="w-full border border-gray-300 rounded p-2"
              placeholder="e.g. 0.205"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Outer Diameter (mm) *
            </label>
            <input
              type="number"
              step="0.001"
              required
              value={form.outer_diameter}
              onChange={e => setForm({ ...form, outer_diameter: e.target.value })}
              className="w-full border border-gray-300 rounded p-2"
              placeholder="e.g. 1.40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cut Length (mm) — optional
            </label>
            <input
              type="number"
              value={form.cut_length}
              onChange={e => setForm({ ...form, cut_length: e.target.value })}
              className="w-full border border-gray-300 rounded p-2"
              placeholder="e.g. 100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Shielding</label>
            <select
              value={form.shielding}
              onChange={e => setForm({ ...form, shielding: e.target.value })}
              className="w-full border border-gray-300 rounded p-2"
            >
              <option value="none">None</option>
              <option value="braided">Braided</option>
              <option value="spiral">Spiral</option>
              <option value="foil">Foil</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Jacket</label>
            <select
              value={form.jacket}
              onChange={e => setForm({ ...form, jacket: e.target.value })}
              className="w-full border border-gray-300 rounded p-2"
            >
              <option value="none">None</option>
              <option value="pvc">PVC</option>
              <option value="pu">PU</option>
              <option value="lszh">LSZH</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Core Structure</label>
            <select
              value={form.core_structure}
              onChange={e => setForm({ ...form, core_structure: e.target.value })}
              className="w-full border border-gray-300 rounded p-2"
            >
              <option value="single">Single Core</option>
              <option value="2_core">2 Core</option>
              <option value="3_core">3 Core</option>
              <option value="4_core">4 Core</option>
              <option value="multi_core">Multi Core</option>
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Equipment Types</label>
          <div className="space-y-2">
            {EQUIPMENT_TYPES.map(t => (
              <label key={t.value} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedTypes[t.value]}
                  onChange={e => setSelectedTypes({ ...selectedTypes, [t.value]: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm">{t.label}</span>
              </label>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Matching...' : 'Match Equipment'}
        </button>
      </form>

      {error && (
        <div className="border border-red-200 bg-red-50 text-red-700 rounded p-4 mb-6">
          {error}
        </div>
      )}

      {result && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Results</h2>
          {result.cable && (
            <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-6">
              <span className="text-sm text-gray-600">Matching for cable:</span>{' '}
              <span className="font-medium">{result.cable.spec}</span>{' '}
              <span className="text-gray-500">({result.cable.brand})</span>
            </div>
          )}
          {result.results.map(typeResult => (
            <div key={typeResult.equipment_type} className="mb-8">
              <h3 className="text-lg font-semibold mb-3 capitalize">
                {formatEquipmentType(typeResult.equipment_type)}
              </h3>
              {typeResult.matches.length === 0 ? (
                <p className="text-gray-500 text-sm">No matching equipment found.</p>
              ) : (
                <div className="space-y-4">
                  {typeResult.matches.map((m, i) => (
                    <MatchResultCard key={m.equipment.id} result={m} rank={i + 1} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MatchForm() {
  return (
    <Suspense fallback={<div className="text-gray-500">Loading...</div>}>
      <MatchFormContent />
    </Suspense>
  );
}
