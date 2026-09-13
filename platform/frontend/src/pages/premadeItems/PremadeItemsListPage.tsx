import { Link } from 'react-router-dom';
import { usePremadeItems, useDeletePremadeItem } from '../../api/premadeItems.js';

export function PremadeItemsListPage() {
  const { data: premadeItems, isLoading, isError } = usePremadeItems();
  const deleteMutation = useDeletePremadeItem();

  function handleDelete(id: string) {
    if (window.confirm('Delete this premade item? This cannot be undone.')) {
      deleteMutation.mutate(id);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Pre-made Items</h1>
        <Link to="/premade-items/new" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          New Pre-made Item
        </Link>
      </div>
      {isLoading && <p className="text-slate-500">Loading…</p>}
      {isError && <p className="text-red-600">Couldn't load premade items. Try refreshing the page.</p>}
      {!isLoading && !isError && premadeItems?.length === 0 && <p className="text-slate-500">No premade items yet.</p>}
      {!isLoading && !isError && premadeItems && premadeItems.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Name</th>
              <th className="py-2">Unit cost</th>
              <th className="py-2">Multiplier</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {premadeItems.map((premadeItem) => (
              <tr key={premadeItem.id} className="border-b border-slate-100">
                <td className="py-2">{premadeItem.name}</td>
                <td className="py-2">{premadeItem.unitCost}</td>
                <td className="py-2">{premadeItem.costMultiplier}</td>
                <td className="py-2 text-right">
                  <Link to={`/premade-items/${premadeItem.id}`} className="text-slate-600 underline">
                    Edit
                  </Link>{' '}
                  <button type="button" onClick={() => handleDelete(premadeItem.id)} className="text-red-600 underline">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
