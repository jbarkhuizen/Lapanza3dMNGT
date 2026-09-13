import { Link } from 'react-router-dom';
import { useLaserMaterials, useDeleteLaserMaterial } from '../../api/laserMaterials.js';

export function LaserMaterialsListPage() {
  const { data: laserMaterials, isLoading, isError } = useLaserMaterials();
  const deleteMutation = useDeleteLaserMaterial();

  function handleDelete(id: string) {
    if (window.confirm('Delete this laser material? This cannot be undone.')) {
      deleteMutation.mutate(id);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Laser Materials</h1>
        <Link to="/laser-materials/new" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          New Laser Material
        </Link>
      </div>
      {isLoading && <p className="text-slate-500">Loading…</p>}
      {isError && <p className="text-red-600">Couldn't load laser materials. Try refreshing the page.</p>}
      {!isLoading && !isError && laserMaterials?.length === 0 && (
        <p className="text-slate-500">No laser materials yet.</p>
      )}
      {!isLoading && !isError && laserMaterials && laserMaterials.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Name</th>
              <th className="py-2">Sheet price</th>
              <th className="py-2">Sheet area (m²)</th>
              <th className="py-2">Usable area (m²)</th>
              <th className="py-2">Multiplier</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {laserMaterials.map((laserMaterial) => (
              <tr key={laserMaterial.id} className="border-b border-slate-100">
                <td className="py-2">{laserMaterial.name}</td>
                <td className="py-2">{laserMaterial.sheetPrice}</td>
                <td className="py-2">{laserMaterial.sheetAreaM2}</td>
                <td className="py-2">{laserMaterial.usableSheetAreaM2}</td>
                <td className="py-2">{laserMaterial.costMultiplier}</td>
                <td className="py-2 text-right">
                  <Link to={`/laser-materials/${laserMaterial.id}`} className="text-slate-600 underline">
                    Edit
                  </Link>{' '}
                  <button type="button" onClick={() => handleDelete(laserMaterial.id)} className="text-red-600 underline">
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
