import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from './client.js';

export interface CostingLabourLine {
  id: string;
  labourStepId: string | null;
  labourStepSnapshotName: string;
  hourlyRateSnapshot: string;
  hours: number;
  lineCost: string;
}

export interface CostingConsumableLine {
  id: string;
  consumableId: string | null;
  consumableSnapshotName: string;
  costPerUnitSnapshot: string;
  quantity: number;
  lineCost: string;
}

export interface CostingTemplate {
  id: string;
  name: string;
  filamentId: string | null;
  filamentSnapshotBrand: string | null;
  filamentSnapshotMaterialType: string | null;
  filamentSnapshotCostPerGram: string | null;
  weightGrams: number;
  printerId: string | null;
  printerSnapshotName: string | null;
  printerSnapshotElectricityRatePerKwh: string | null;
  printerSnapshotDepreciationPerHour: string | null;
  printTimeHours: number;
  markupPercent: string;
  filamentCost: string;
  electricityCost: string;
  depreciationCost: string;
  labourCost: string;
  consumablesCost: string;
  totalCost: string;
  suggestedPrice: string;
  createdAt: string;
  labourLines?: CostingLabourLine[];
  consumableLines?: CostingConsumableLine[];
}

export interface CostingTemplateFormInput {
  name: string;
  filamentId: string;
  weightGrams: number;
  printerId: string;
  printTimeHours: number;
  markupPercent: number;
  labourLines: Array<{ labourStepId: string; hours: number }>;
  consumableLines: Array<{ consumableId: string; quantity: number }>;
}

export const COSTING_TEMPLATES_QUERY_KEY = ['costingTemplates'] as const;

export function useCostingTemplates() {
  return useQuery({
    queryKey: COSTING_TEMPLATES_QUERY_KEY,
    queryFn: () =>
      apiGet<{ costingTemplates: CostingTemplate[] }>('/api/costing-templates').then((r) => r.costingTemplates),
  });
}

export function useCostingTemplate(id: string | undefined) {
  return useQuery({
    queryKey: [...COSTING_TEMPLATES_QUERY_KEY, id],
    queryFn: () =>
      apiGet<{ costingTemplate: CostingTemplate }>(`/api/costing-templates/${id}`).then((r) => r.costingTemplate),
    enabled: id !== undefined,
  });
}

export function useCreateCostingTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CostingTemplateFormInput) =>
      apiPost<{ costingTemplate: CostingTemplate }>('/api/costing-templates', data).then((r) => r.costingTemplate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COSTING_TEMPLATES_QUERY_KEY });
    },
  });
}
