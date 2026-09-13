import { Link } from 'react-router-dom';
import { useScanners, useDeleteScanner } from '../../api/scanners.js';

export function ScannersListPage() {
  const { data: scanners, isLoading, isError } = useScanners();
  const deleteMutation = useDeleteScanner();

  function handleDelete(id: string) {
    if (window.confirm('Delete this scanner? This cannot be undone.')) {
      deleteMutation.mutate(id);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Scanners</h1>
        <Link to="/scanners/new" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          New Scanner
        </Link>
      </div>
      {isLoading && <p className="text-slate-500">Loading…</p>}
      {isError && <p className="text-red-600">Couldn't load scanners. Try refreshing the page.</p>}
      {!isLoading && !isError && scanners?.length === 0 && <p className="text-slate-500">No scanners yet.</p>}
      {!isLoading && !isError && scanners && scanners.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Name</th>
              <th className="py-2">Scanner cost</th>
              <th className="py-2">Expected scan hours</th>
              <th className="py-2">Power cost / hour</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {scanners.map((scanner) => (
              <tr key={scanner.id} className="border-b border-slate-100">
                <td className="py-2">{scanner.name}</td>
                <td className="py-2">{scanner.scannerCost}</td>
                <td className="py-2">{scanner.expectedScanHours}</td>
                <td className="py-2">{scanner.powerCostPerHour}</td>
                <td className="py-2 text-right">
                  <Link to={`/scanners/${scanner.id}`} className="text-slate-600 underline">
                    Edit
                  </Link>{' '}
                  <button type="button" onClick={() => handleDelete(scanner.id)} className="text-red-600 underline">
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
