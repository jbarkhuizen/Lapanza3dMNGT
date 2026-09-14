import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { MoreDetailsToggle } from '../../components/MoreDetailsToggle.js';
import { InlineEditableRow } from '../../components/InlineEditableRow.js';
import { ApiError } from '../../api/client.js';
import {
  useProducts,
  useProduct,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  type Product,
  type ProductFormInput,
} from '../../api/products.js';

type ProductFormState = Omit<ProductFormInput, 'cost' | 'sellingPrice'> & {
  cost: number | undefined;
  sellingPrice: number | undefined;
};

const emptyForm: ProductFormState = { name: '', category: '', cost: undefined, sellingPrice: undefined };

export function ProductsListPage() {
  const { id: deepLinkedId } = useParams();
  const { data: products, isLoading, isError } = useProducts();
  const deleteMutation = useDeleteProduct();

  function handleDelete(id: string) {
    if (window.confirm('Delete this product? This cannot be undone.')) {
      deleteMutation.mutate(id);
    }
  }

  // ---- Add form state (essentials always visible + More details) ----
  const [addForm, setAddForm] = useState<ProductFormState>(emptyForm);
  const [addError, setAddError] = useState<string | null>(null);
  const createMutation = useCreateProduct();

  function setAdd<K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) {
    setAddForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    try {
      // `name`, `cost`, and `sellingPrice` are required and `cost`/`sellingPrice` are
      // guaranteed non-undefined here because the inputs' `required` attribute blocks
      // submitting while blank -- safe to assert back to the full input type for create.
      await createMutation.mutateAsync(addForm as ProductFormInput);
      setAddForm(emptyForm);
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  // ---- Edit-in-place state ----
  const [editingId, setEditingId] = useState<string | null>(deepLinkedId ?? null);
  const [editForm, setEditForm] = useState<ProductFormState>(emptyForm);
  const [editError, setEditError] = useState<string | null>(null);
  const updateMutation = useUpdateProduct(editingId ?? '');
  const { data: deepLinkedProduct } = useProduct(deepLinkedId);
  const populatedForIdRef = useRef<string | undefined>(undefined);

  function startEdit(product: Product) {
    setEditingId(product.id);
    setEditError(null);
    setEditForm({
      name: product.name,
      category: product.category ?? '',
      cost: Number(product.cost),
      sellingPrice: Number(product.sellingPrice),
    });
  }

  // Deep-link support: /products/:id auto-expands that row once its data has loaded.
  useEffect(() => {
    if (deepLinkedId && deepLinkedProduct && populatedForIdRef.current !== deepLinkedId) {
      populatedForIdRef.current = deepLinkedId;
      startEdit(deepLinkedProduct);
      document.getElementById(`product-row-${deepLinkedId}`)?.scrollIntoView({ block: 'center' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkedId, deepLinkedProduct]);

  function setEdit<K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  }

  // Explicit "clear" affordance for category (edit mode only): sends `null`, which --
  // unlike `undefined` -- survives JSON.stringify and tells the PATCH endpoint to
  // actually clear the stored value instead of leaving it untouched.
  function clearEditCategory() {
    setEdit('category', null);
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    setEditError(null);
    try {
      await updateMutation.mutateAsync(editForm);
      setEditingId(null);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Products</h1>

      <form onSubmit={handleAdd} className="flex flex-col gap-3 rounded border border-slate-200 p-4 dark:border-slate-700">
        <div className="flex flex-wrap items-end gap-3">
          <FormField id="add-name" label="Name" value={addForm.name} onChange={(e) => setAdd('name', e.target.value)} required />
          <FormField
            id="add-cost"
            label="Cost"
            type="number"
            value={addForm.cost ?? ''}
            onChange={(e) => setAdd('cost', e.target.value ? Number(e.target.value) : undefined)}
            required
          />
          <FormField
            id="add-sellingPrice"
            label="Selling price"
            type="number"
            value={addForm.sellingPrice ?? ''}
            onChange={(e) => setAdd('sellingPrice', e.target.value ? Number(e.target.value) : undefined)}
            required
          />
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            Add
          </button>
        </div>
        <MoreDetailsToggle>
          <FormField
            id="add-category"
            label="Category"
            value={addForm.category ?? ''}
            onChange={(e) => setAdd('category', e.target.value)}
          />
        </MoreDetailsToggle>
        {addError && <p className="text-sm text-red-600 dark:text-red-400">{addError}</p>}
      </form>

      {isLoading && <p className="text-slate-500 dark:text-slate-400">Loading…</p>}
      {isError && <p className="text-red-600 dark:text-red-400">Couldn't load products. Try refreshing the page.</p>}
      {!isLoading && !isError && products?.length === 0 && <p className="text-slate-500 dark:text-slate-400">No products yet.</p>}
      {!isLoading && !isError && products && products.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="py-2">Name</th>
              <th className="py-2">Category</th>
              <th className="py-2">Cost</th>
              <th className="py-2">Selling price</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <InlineEditableRow
                key={product.id}
                isEditing={editingId === product.id}
                readOnlyContent={
                  <>
                    <td id={`product-row-${product.id}`} className="py-2">
                      {product.name}
                    </td>
                    <td className="py-2">{product.category ?? '—'}</td>
                    <td className="py-2">{product.cost}</td>
                    <td className="py-2">{product.sellingPrice}</td>
                    <td className="py-2 text-right">
                      <button type="button" onClick={() => startEdit(product)} className="text-slate-600 underline dark:text-slate-400">
                        Edit
                      </button>{' '}
                      <button type="button" onClick={() => handleDelete(product.id)} className="text-red-600 underline dark:text-red-400">
                        Delete
                      </button>
                    </td>
                  </>
                }
                editContent={
                  <td colSpan={5} className="py-3">
                    <form onSubmit={handleSaveEdit} className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-end gap-3">
                        <FormField id="edit-name" label="Name" value={editForm.name} onChange={(e) => setEdit('name', e.target.value)} required />
                        <FormField
                          id="edit-cost"
                          label="Cost"
                          type="number"
                          value={editForm.cost ?? ''}
                          onChange={(e) => setEdit('cost', e.target.value ? Number(e.target.value) : undefined)}
                          required
                        />
                        <FormField
                          id="edit-sellingPrice"
                          label="Selling price"
                          type="number"
                          value={editForm.sellingPrice ?? ''}
                          onChange={(e) => setEdit('sellingPrice', e.target.value ? Number(e.target.value) : undefined)}
                          required
                        />
                      </div>
                      <MoreDetailsToggle>
                        <div className="flex flex-col gap-1">
                          <label htmlFor="edit-category" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Category
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              id="edit-category"
                              value={editForm.category ?? ''}
                              onChange={(e) => setEdit('category', e.target.value)}
                              className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                            />
                            <button type="button" onClick={clearEditCategory} className="text-sm text-slate-500 underline dark:text-slate-400">
                              Clear
                            </button>
                          </div>
                        </div>
                      </MoreDetailsToggle>
                      {editError && <p className="text-sm text-red-600 dark:text-red-400">{editError}</p>}
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={updateMutation.isPending}
                          className="w-fit rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
                        >
                          Save
                        </button>
                        <button type="button" onClick={cancelEdit} className="w-fit rounded bg-slate-100 px-3 py-2 text-sm dark:bg-slate-700 dark:text-slate-100">
                          Cancel
                        </button>
                      </div>
                    </form>
                  </td>
                }
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
