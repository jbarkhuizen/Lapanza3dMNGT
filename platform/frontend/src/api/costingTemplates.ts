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

export type CostingTemplateProcess = 'printer' | 'scanner' | 'laser_sheet' | 'laser_premade';

export interface CostingTemplate {
  id: string;
  name: string;
  process: CostingTemplateProcess;
  filamentId: string | null;
  filamentSnapshotBrand: string | null;
  filamentSnapshotMaterialType: string | null;
  filamentSnapshotCostPerGram: string | null;
  weightGrams: number | null;
  printerId: string | null;
  printerSnapshotName: string | null;
  printerSnapshotElectricityRatePerKwh: string | null;
  printerSnapshotDepreciationPerHour: string | null;
  printTimeHours: number | null;
  scannerId: string | null;
  scannerSnapshotName: string | null;
  scanHours: number | null;
  laserMaterialId: string | null;
  laserMaterialSnapshotName: string | null;
  sheetAreaUsedM2: number | null;
  premadeItemId: string | null;
  premadeItemSnapshotName: string | null;
  premadeItemQuantity: number | null;
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

interface SharedCostingTemplateFormFields {
  name: string;
  markupPercent: number;
  labourLines: Array<{ labourStepId: string; hours: number }>;
  consumableLines: Array<{ consumableId: string; quantity: number }>;
}

// A discriminated union on `process` mirroring the backend's own
// discriminated create schema in `platform/api/src/routes/costing-templates.ts`
// -- only one process's fields are ever sent per request.
export type CostingTemplateFormInput =
  | (SharedCostingTemplateFormFields & {
      process: 'printer';
      filamentId: string;
      weightGrams: number;
      printerId: string;
      printTimeHours: number;
    })
  | (SharedCostingTemplateFormFields & {
      process: 'scanner';
      scannerId: string;
      scanHours: number;
    })
  | (SharedCostingTemplateFormFields & {
      process: 'laser_sheet';
      laserMaterialId: string;
      sheetAreaUsedM2: number;
    })
  | (SharedCostingTemplateFormFields & {
      process: 'laser_premade';
      premadeItemId: string;
      premadeItemQuantity: number;
    });

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
