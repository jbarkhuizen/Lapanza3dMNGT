import { Link } from 'react-router-dom';
import { useLabourSteps } from '../../api/labourSteps.js';

export function LabourStepsListPage() {
  const { data: labourSteps, isLoading, isError } = useLabourSteps();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Labour Steps</h1>
        <Link to="/labour-steps/new" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          New Labour Step
        </Link>
      </div>
      {isLoading && <p className="text-slate-500">Loading…</p>}
      {isError && <p className="text-red-600">Couldn't load labour steps. Try refreshing the page.</p>}
      {!isLoading && !isError && labourSteps?.length === 0 && <p className="text-slate-500">No labour steps yet.</p>}
      {!isLoading && !isError && labourSteps && labourSteps.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Name</th>
              <th className="py-2">Hourly rate</th>
              <th className="py-2">Active</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {labourSteps.map((step) => (
              <tr key={step.id} className="border-b border-slate-100">
                <td className="py-2">{step.name}</td>
                <td className="py-2">{step.hourlyRate}</td>
                <td className="py-2">{step.active ? 'Yes' : 'No'}</td>
                <td className="py-2 text-right">
                  <Link to={`/labour-steps/${step.id}`} className="text-slate-600 underline">
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
