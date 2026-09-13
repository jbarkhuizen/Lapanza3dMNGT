import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from './client.js';

export interface LaserMaterial {
  id: string;
  name: string;
  sheetPrice: number;
  sheetAreaM2: number;
  usableSheetAreaM2: number;
  costMultiplier: number;
  createdAt: string;
}

export interface LaserMaterialFormInput {
  name: string;
  sheetPrice: number;
  sheetAreaM2: number;
  usableSheetAreaM2: number;
  costMultiplier?: number;
}

const LASER_MATERIALS_QUERY_KEY = ['laserMaterials'] as const;

export function useLaserMaterials() {
  return useQuery({
    queryKey: LASER_MATERIALS_QUERY_KEY,
    queryFn: () => apiGet<{ laserMaterials: LaserMaterial[] }>('/api/laser-materials').then((r) => r.laserMaterials),
  });
}

export function useLaserMaterial(id: string | undefined) {
  return useQuery({
    queryKey: [...LASER_MATERIALS_QUERY_KEY, id],
    queryFn: () => apiGet<{ laserMaterial: LaserMaterial }>(`/api/laser-materials/${id}`).then((r) => r.laserMaterial),
    enabled: id !== undefined,
  });
}

export function useCreateLaserMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: LaserMaterialFormInput) =>
      apiPost<{ laserMaterial: LaserMaterial }>('/api/laser-materials', data).then((r) => r.laserMaterial),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LASER_MATERIALS_QUERY_KEY });
    },
  });
}

export function useUpdateLaserMaterial(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<LaserMaterialFormInput>) => apiPatch(`/api/laser-materials/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LASER_MATERIALS_QUERY_KEY });
    },
  });
}

export function useDeleteLaserMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/laser-materials/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LASER_MATERIALS_QUERY_KEY });
    },
  });
}
