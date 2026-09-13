import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { ApiError } from '../../api/client.js';
import { useProduct, useCreateProduct, useUpdateProduct, type ProductFormInput } from '../../api/products.js';

type ProductFormState = Omit<ProductFormInput, 'cost' | 'sellingPrice'> & {
  cost: number | undefined;
  sellingPrice: number | undefined;
};

const emptyForm: ProductFormState = { name: '', category: '', cost: undefined, sellingPrice: undefined };

export function ProductFormPage() {
  const { id } = useParams();
  const isEditMode = id !== undefined;
  const navigate = useNavigate();
  const { data: existingProduct, isLoading: isLoadingProduct, isError: isProductError } = useProduct(id);
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct(id ?? '');
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const populatedForIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (existingProduct && populatedForIdRef.current !== id) {
      populatedForIdRef.current = id;
      setForm({
        name: existingProduct.name,
        category: existingProduct.category ?? '',
        cost: Number(existingProduct.cost),
        sellingPrice: Number(existingProduct.sellingPrice),
      });
    }
  }, [existingProduct, id]);

  function set<K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Explicit "clear" affordance for category (edit mode only): sends `null`, which --
  // unlike `undefined` -- survives JSON.stringify and tells the PATCH endpoint to
  // actually clear the stored value instead of leaving it untouched.
  function clearCategory() {
    set('category', null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (isEditMode) {
        await updateMutation.mutateAsync(form);
      } else {
        await createMutation.mutateAsync(form as ProductFormInput);
      }
      navigate('/products');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  if (isEditMode && isLoadingProduct) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (isEditMode && isProductError) {
    return <p className="text-red-600">Couldn't load this product. It may have been deleted.</p>;
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900">{isEditMode ? 'Edit Product' : 'New Product'}</h1>
      <FormField id="name" label="Name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
      <div className="flex flex-col gap-1">
        <label htmlFor="categoryText" className="text-sm font-medium text-slate-700">Category</label>
        <div className="flex items-center gap-2">
          <input
            id="categoryText"
            value={form.category ?? ''}
            onChange={(e) => set('category', e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          {isEditMode && (
            <button type="button" onClick={clearCategory} className="text-sm text-slate-500 underline">
              Clear
            </button>
          )}
        </div>
      </div>
      <FormField
        id="cost"
        label="Cost"
        type="number"
        value={form.cost ?? ''}
        onChange={(e) => set('cost', e.target.value ? Number(e.target.value) : undefined)}
        required
      />
      <FormField
        id="sellingPrice"
        label="Selling price"
        type="number"
        value={form.sellingPrice ?? ''}
        onChange={(e) => set('sellingPrice', e.target.value ? Number(e.target.value) : undefined)}
        required
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Save
      </button>
    </form>
  );
}
