import { Link } from 'react-router-dom';
import { useConsumables } from '../../api/consumables.js';

export function ConsumablesListPage() {
  const { data: consumables, isLoading, isError } = useConsumables();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Consumables</h1>
        <Link to="/consumables/new" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          New Consumable
        </Link>
      </div>
      {isLoading && <p className="text-slate-500">Loading…</p>}
      {isError && <p className="text-red-600">Couldn't load consumables. Try refreshing the page.</p>}
      {!isLoading && !isError && consumables?.length === 0 && <p className="text-slate-500">No consumables yet.</p>}
      {!isLoading && !isError && consumables && consumables.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Name</th>
              <th className="py-2">Category</th>
              <th className="py-2">Unit</th>
              <th className="py-2">Cost per unit</th>
              <th className="py-2">Current stock</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {consumables.map((consumable) => (
              <tr key={consumable.id} className="border-b border-slate-100">
                <td className="py-2">{consumable.name}</td>
                <td className="py-2">{consumable.category}</td>
                <td className="py-2">{consumable.unitOfMeasure}</td>
                <td className="py-2">{consumable.costPerUnit}</td>
                <td className="py-2">{consumable.currentStock}</td>
                <td className="py-2 text-right">
                  <Link to={`/consumables/${consumable.id}`} className="text-slate-600 underline">
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
