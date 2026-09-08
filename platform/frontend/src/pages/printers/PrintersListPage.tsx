import { Link } from 'react-router-dom';
import { usePrinters } from '../../api/printers.js';

export function PrintersListPage() {
  const { data: printers, isLoading, isError } = usePrinters();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Printers</h1>
        <Link to="/printers/new" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          New Printer
        </Link>
      </div>
      {isLoading && <p className="text-slate-500">Loading…</p>}
      {isError && <p className="text-red-600">Couldn't load printers. Try refreshing the page.</p>}
      {!isLoading && !isError && printers?.length === 0 && <p className="text-slate-500">No printers yet.</p>}
      {!isLoading && !isError && printers && printers.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Name</th>
              <th className="py-2">Make</th>
              <th className="py-2">Model</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {printers.map((printer) => (
              <tr key={printer.id} className="border-b border-slate-100">
                <td className="py-2">{printer.name}</td>
                <td className="py-2">{printer.make ?? '—'}</td>
                <td className="py-2">{printer.model ?? '—'}</td>
                <td className="py-2">{printer.status}</td>
                <td className="py-2 text-right">
                  <Link to={`/printers/${printer.id}`} className="text-slate-600 underline">
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
