import { useQuery } from '@tanstack/react-query';
import { apiGet } from './client.js';

export interface Material {
  id: string;
  name: string;
  chemistry: string;
  bestFor: string;
  nozzleTempC: number;
  bedTempC: number;
  requiresEnclosure: boolean;
  requiresHardenedNozzle: boolean;
  requiresDirectDrive: boolean;
  recommendsDryFilament: boolean;
  recommendsVentilation: boolean;
  difficulty: string;
  moisture: string;
  abrasive: boolean;
  priceZarPerKgLow: number;
  priceZarPerKgHigh: number;
  priceEstimated: boolean;
  whyChooseIt: string;
  avoidWhenText: string;
  tags: string[];
  createdAt: string;
}

const MATERIALS_QUERY_KEY = ['materials'] as const;

export function useMaterials(tag?: string) {
  return useQuery({
    queryKey: [...MATERIALS_QUERY_KEY, tag ?? null],
    queryFn: () =>
      apiGet<{ materials: Material[] }>(tag ? `/api/materials?tag=${encodeURIComponent(tag)}` : '/api/materials').then(
        (r) => r.materials,
      ),
  });
}

export function useMaterial(id: string | undefined) {
  return useQuery({
    queryKey: [...MATERIALS_QUERY_KEY, 'detail', id],
    queryFn: () => apiGet<{ material: Material }>(`/api/materials/${id}`).then((r) => r.material),
    enabled: id !== undefined,
  });
}
