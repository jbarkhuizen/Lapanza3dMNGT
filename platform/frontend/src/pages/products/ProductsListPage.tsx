import { Link } from 'react-router-dom';
import { useProducts, useDeleteProduct } from '../../api/products.js';

export function ProductsListPage() {
  const { data: products, isLoading, isError } = useProducts();
  const deleteMutation = useDeleteProduct();

  function handleDelete(id: string) {
    if (window.confirm('Delete this product? This cannot be undone.')) {
      deleteMutation.mutate(id);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Products</h1>
        <Link to="/products/new" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          New Product
        </Link>
      </div>
      {isLoading && <p className="text-slate-500">Loading…</p>}
      {isError && <p className="text-red-600">Couldn't load products. Try refreshing the page.</p>}
      {!isLoading && !isError && products?.length === 0 && <p className="text-slate-500">No products yet.</p>}
      {!isLoading && !isError && products && products.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Name</th>
              <th className="py-2">Category</th>
              <th className="py-2">Cost</th>
              <th className="py-2">Selling price</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-b border-slate-100">
                <td className="py-2">{product.name}</td>
                <td className="py-2">{product.category ?? '—'}</td>
                <td className="py-2">{product.cost}</td>
                <td className="py-2">{product.sellingPrice}</td>
                <td className="py-2 text-right">
                  <Link to={`/products/${product.id}`} className="text-slate-600 underline">
                    Edit
                  </Link>{' '}
                  <button type="button" onClick={() => handleDelete(product.id)} className="text-red-600 underline">
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
