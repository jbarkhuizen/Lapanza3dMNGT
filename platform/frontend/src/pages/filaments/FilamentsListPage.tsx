import { Link } from 'react-router-dom';
import { useFilaments } from '../../api/filaments.js';

export function FilamentsListPage() {
  const { data: filaments, isLoading, isError } = useFilaments();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Filaments</h1>
        <Link to="/filaments/new" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          New Filament
        </Link>
      </div>
      {isLoading && <p className="text-slate-500">Loading…</p>}
      {isError && <p className="text-red-600">Couldn't load filaments. Try refreshing the page.</p>}
      {!isLoading && !isError && filaments?.length === 0 && <p className="text-slate-500">No filaments yet.</p>}
      {!isLoading && !isError && filaments && filaments.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Brand</th>
              <th className="py-2">Material</th>
              <th className="py-2">Diameter</th>
              <th className="py-2">Colour</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filaments.map((filament) => (
              <tr key={filament.id} className="border-b border-slate-100">
                <td className="py-2">{filament.brand}</td>
                <td className="py-2">{filament.materialType}</td>
                <td className="py-2">{filament.diameterMm}mm</td>
                <td className="py-2">{filament.colour ?? '—'}</td>
                <td className="py-2 text-right">
                  <Link to={`/filaments/${filament.id}`} className="text-slate-600 underline">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
