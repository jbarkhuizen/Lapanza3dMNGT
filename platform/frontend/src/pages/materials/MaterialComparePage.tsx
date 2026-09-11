import { Link, useSearchParams } from 'react-router-dom';
import { useMaterial, type Material } from '../../api/materials.js';

interface CompareRow {
  label: string;
  render: (material: Material) => string;
}

// Same structural idea as landing/public/js/materials.js's COMPARE_ROWS /
// renderCompareResult(), as a React component instead of hand-built DOM.
const COMPARE_ROWS: CompareRow[] = [
  { label: 'Nozzle temperature', render: (m) => `${m.nozzleTempC} °C` },
  { label: 'Bed temperature', render: (m) => `${m.bedTempC} °C` },
  { label: 'Difficulty', render: (m) => m.difficulty },
  { label: 'Moisture sensitivity', render: (m) => m.moisture },
  { label: 'Abrasive to nozzles', render: (m) => (m.abrasive ? 'Yes' : 'No') },
  {
    label: 'Price',
    render: (m) => `R${m.priceZarPerKgLow}–R${m.priceZarPerKgHigh}/kg${m.priceEstimated ? ' (est.)' : ''}`,
  },
  {
    label: 'Requirements',
    render: (m) => {
      const requirements: string[] = [];
      if (m.requiresEnclosure) requirements.push('Enclosure');
      if (m.requiresHardenedNozzle) requirements.push('Hardened nozzle');
      if (m.requiresDirectDrive) requirements.push('Direct drive');
      if (m.recommendsDryFilament) requirements.push('Dry filament');
      if (m.recommendsVentilation) requirements.push('Ventilation');
      return requirements.length > 0 ? requirements.join(', ') : 'None';
    },
  },
];

export function MaterialComparePage() {
  const [searchParams] = useSearchParams();
  const aId = searchParams.get('a') ?? undefined;
  const bId = searchParams.get('b') ?? undefined;

  const { data: materialA, isLoading: isLoadingA, isError: isErrorA } = useMaterial(aId);
  const { data: materialB, isLoading: isLoadingB, isError: isErrorB } = useMaterial(bId);

  const isLoading = (aId !== undefined && isLoadingA) || (bId !== undefined && isLoadingB);
  // Either id missing, or (once loaded) invalid — an unknown id 404s and
  // useMaterial surfaces that as isError. Both cases fall back to the same
  // empty-state copy rather than a scary error message.
  const isInvalid = !aId || !bId || (!isLoading && (isErrorA || isErrorB));

  if (isInvalid) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">Compare materials</h1>
        <p className="text-slate-500">
          Pick two materials to compare them.{' '}
          <Link to="/materials" className="underline">
            Back to materials
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900">Compare materials</h1>
      {isLoading && <p className="text-slate-500">Loading…</p>}
      {!isLoading && materialA && materialB && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Point</th>
              <th className="py-2">{materialA.name}</th>
              <th className="py-2">{materialB.name}</th>
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map((row) => (
              <tr key={row.label} className="border-b border-slate-100">
                <th className="py-2 font-medium text-slate-700">{row.label}</th>
                <td className="py-2">{row.render(materialA)}</td>
                <td className="py-2">{row.render(materialB)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
