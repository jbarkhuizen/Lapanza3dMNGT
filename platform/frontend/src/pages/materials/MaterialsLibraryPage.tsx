import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMaterials, type Material } from '../../api/materials.js';

// Same tag vocabulary as landing/public/js/materials.js's TAG_LABELS.
const TAG_LABELS: Record<string, string> = {
  'beginner-friendly': 'Beginner-friendly',
  flexible: 'Flexible',
  'outdoor-safe': 'Outdoor-safe',
  'food-safe': 'Food-safe',
  engineering: 'Engineering',
};

function getUseThisMaterialHref(material: Material): string {
  const midpoint = Math.round((material.priceZarPerKgLow + material.priceZarPerKgHigh) / 2);
  const params = new URLSearchParams({ materialType: material.name, costPerKg: String(midpoint) });
  return `/filaments/new?${params.toString()}`;
}

function MaterialCard({
  material,
  checked,
  onToggle,
}: {
  material: Material;
  checked: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-semibold text-slate-900">{material.name}</h3>
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggle(material.id)}
            aria-label={`Compare ${material.name}`}
          />
          Compare
        </label>
      </div>
      <p className="text-sm text-slate-500">{material.chemistry}</p>
      <p className="text-sm text-slate-700">
        <strong>Best for: </strong>
        {material.bestFor}
      </p>
      <p className="text-sm text-slate-700">
        R{material.priceZarPerKgLow}–R{material.priceZarPerKgHigh}/kg
        {material.priceEstimated ? ' (est.)' : ''}
      </p>
      <div className="flex flex-wrap gap-1">
        {material.tags.map((tag) => (
          <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {TAG_LABELS[tag] ?? tag}
          </span>
        ))}
      </div>
      <Link
        to={getUseThisMaterialHref(material)}
        className="mt-2 w-fit rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
      >
        Use this material
      </Link>
    </div>
  );
}

export function MaterialsLibraryPage() {
  const [activeTag, setActiveTag] = useState<string | undefined>(undefined);
  const { data: materials, isLoading, isError } = useMaterials(activeTag);
  const [selected, setSelected] = useState<string[]>([]);
  const navigate = useNavigate();

  function toggleSelected(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) {
        return prev.filter((existing) => existing !== id);
      }
      if (prev.length >= 2) {
        // Keep it simple: a third click replaces the first-picked selection
        // rather than being a no-op, so the user isn't stuck unable to swap
        // one of their two picks without first unchecking it.
        return [prev[1], id];
      }
      return [...prev, id];
    });
  }

  function handleCompare() {
    if (selected.length !== 2) return;
    const [a, b] = selected;
    navigate(`/materials/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Materials</h1>
        {selected.length === 2 && (
          <button
            type="button"
            onClick={handleCompare}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Compare selected
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTag(undefined)}
          aria-pressed={activeTag === undefined}
          className={`rounded-full border px-3 py-1 text-sm ${
            activeTag === undefined ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-700'
          }`}
        >
          All materials
        </button>
        {Object.entries(TAG_LABELS).map(([tag, label]) => (
          <button
            key={tag}
            type="button"
            onClick={() => setActiveTag(tag)}
            aria-pressed={activeTag === tag}
            className={`rounded-full border px-3 py-1 text-sm ${
              activeTag === tag ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-slate-500">Loading…</p>}
      {isError && <p className="text-red-600">Couldn't load materials. Try refreshing the page.</p>}
      {!isLoading && !isError && materials?.length === 0 && <p className="text-slate-500">No materials match this filter.</p>}
      {!isLoading && !isError && materials && materials.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {materials.map((material) => (
            <MaterialCard
              key={material.id}
              material={material}
              checked={selected.includes(material.id)}
              onToggle={toggleSelected}
            />
          ))}
        </div>
      )}
    </div>
  );
}
