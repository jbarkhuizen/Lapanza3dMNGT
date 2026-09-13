import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from './client.js';

export interface Product {
  id: string;
  name: string;
  category: string | null;
  cost: string;
  sellingPrice: string;
  createdAt: string;
}

export interface ProductFormInput {
  name: string;
  // string to set, null to explicitly clear (edit mode only), undefined to leave unset/untouched.
  category?: string | null;
  cost: number;
  sellingPrice: number;
}

const PRODUCTS_QUERY_KEY = ['products'] as const;

export function useProducts() {
  return useQuery({
    queryKey: PRODUCTS_QUERY_KEY,
    queryFn: () => apiGet<{ products: Product[] }>('/api/products').then((r) => r.products),
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, id],
    queryFn: () => apiGet<{ product: Product }>(`/api/products/${id}`).then((r) => r.product),
    enabled: id !== undefined,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ProductFormInput) => apiPost<{ product: Product }>('/api/products', data).then((r) => r.product),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });
}

export function useUpdateProduct(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ProductFormInput>) => apiPatch(`/api/products/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });
}
