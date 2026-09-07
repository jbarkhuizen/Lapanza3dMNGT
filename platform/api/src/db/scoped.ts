import { prisma } from './client.js';

export interface CreateCustomerInput {
  name: string;
  billingAddress: string;
  company?: string;
  email?: string;
  phone?: string;
  deliveryAddress?: string;
  vatNumber?: string;
  notes?: string;
}

export interface UpdateCustomerInput {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  billingAddress?: string;
  deliveryAddress?: string;
  vatNumber?: string;
  notes?: string;
}

export interface CreatePrinterInput {
  name: string;
  make?: string;
  model?: string;
  buildVolumeXMm?: number;
  buildVolumeYMm?: number;
  buildVolumeZMm?: number;
  purchaseDate?: string;
  purchaseCost?: number;
  powerDrawWatts?: number;
  status?: string;
}

export interface UpdatePrinterInput {
  name?: string;
  make?: string;
  model?: string;
  buildVolumeXMm?: number;
  buildVolumeYMm?: number;
  buildVolumeZMm?: number;
  purchaseDate?: string;
  purchaseCost?: number;
  powerDrawWatts?: number;
  status?: string;
}

export interface CreatePrinterPresetInput {
  name: string;
  materialType: string;
  nozzleTempC?: number;
  bedTempC?: number;
  printSpeedMmS?: number;
  layerHeightMm?: number;
  infillPercent?: number;
  notes?: string;
}

export interface UpdatePrinterPresetInput {
  name?: string;
  materialType?: string;
  nozzleTempC?: number;
  bedTempC?: number;
  printSpeedMmS?: number;
  layerHeightMm?: number;
  infillPercent?: number;
  notes?: string;
}

export interface CreateMaintenanceLogInput {
  date: string;
  description: string;
  cost?: number;
  performedBy?: string;
}

export interface CreateFilamentInput {
  brand: string;
  materialType: string;
  diameterMm: number;
  colour?: string;
  costPerSpool?: number;
  costPerKg?: number;
  spoolWeightGrams?: number;
  remainingWeightGrams?: number;
  supplier?: string;
  purchaseDate?: string;
  notes?: string;
  lowStockThresholdGrams?: number;
}

export interface UpdateFilamentInput {
  brand?: string;
  materialType?: string;
  diameterMm?: number;
  colour?: string;
  costPerSpool?: number;
  costPerKg?: number;
  spoolWeightGrams?: number;
  remainingWeightGrams?: number;
  supplier?: string;
  purchaseDate?: string;
  notes?: string;
  lowStockThresholdGrams?: number;
}

export interface CreateLabourStepInput {
  name: string;
  hourlyRate: number;
  active?: boolean;
}

export interface UpdateLabourStepInput {
  name?: string;
  hourlyRate?: number;
  active?: boolean;
}

export interface CreateConsumableInput {
  name: string;
  category: string;
  unitOfMeasure: string;
  costPerUnit: number;
  currentStock?: number;
  reorderThreshold?: number;
  supplier?: string;
}

export interface UpdateConsumableInput {
  name?: string;
  category?: string;
  unitOfMeasure?: string;
  costPerUnit?: number;
  currentStock?: number;
  reorderThreshold?: number;
  supplier?: string;
}

export function tenantScope(tenantId: string) {
  if (!tenantId) {
    throw new Error('tenantScope requires a tenantId');
  }
  return {
    customers: {
      findMany: () => prisma.customer.findMany({ where: { tenantId } }),

      findById: (id: string) => prisma.customer.findFirst({ where: { id, tenantId } }),

      create: (data: CreateCustomerInput) =>
        prisma.customer.create({ data: { ...data, tenantId } }),

      update: (id: string, data: UpdateCustomerInput) =>
        prisma.customer.updateMany({ where: { id, tenantId }, data: { ...data, tenantId: undefined } }),
    },

    printers: {
      findMany: () => prisma.printer.findMany({ where: { tenantId } }),

      findById: (id: string) => prisma.printer.findFirst({ where: { id, tenantId } }),

      create: (data: CreatePrinterInput) =>
        prisma.printer.create({
          data: {
            ...data,
            purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
            tenantId,
          },
        }),

      update: (id: string, data: UpdatePrinterInput) =>
        prisma.printer.updateMany({
          where: { id, tenantId },
          data: {
            ...data,
            purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
            tenantId: undefined,
          },
        }),
    },

    printerPresets: {
      findMany: (printerId: string) =>
        prisma.printerPreset.findMany({ where: { printerId, tenantId } }),

      findById: (printerId: string, id: string) =>
        prisma.printerPreset.findFirst({ where: { id, printerId, tenantId } }),

      create: (printerId: string, data: CreatePrinterPresetInput) =>
        prisma.printerPreset.create({ data: { ...data, printerId, tenantId } }),

      update: (printerId: string, id: string, data: UpdatePrinterPresetInput) =>
        prisma.printerPreset.updateMany({
          where: { id, printerId, tenantId },
          data: { ...data, tenantId: undefined, printerId: undefined },
        }),
    },

    printerMaintenanceLogs: {
      findMany: (printerId: string) =>
        prisma.printerMaintenanceLog.findMany({
          where: { printerId, tenantId },
          orderBy: { date: 'desc' },
        }),

      create: (printerId: string, data: CreateMaintenanceLogInput) =>
        prisma.printerMaintenanceLog.create({
          data: { ...data, date: new Date(data.date), printerId, tenantId },
        }),
    },

    filaments: {
      findMany: () => prisma.filament.findMany({ where: { tenantId } }),

      findById: (id: string) => prisma.filament.findFirst({ where: { id, tenantId } }),

      create: (data: CreateFilamentInput) =>
        prisma.filament.create({
          data: {
            ...data,
            purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
            tenantId,
          },
        }),

      update: (id: string, data: UpdateFilamentInput) =>
        prisma.filament.updateMany({
          where: { id, tenantId },
          data: {
            ...data,
            purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
            tenantId: undefined,
          },
        }),
    },

    labourSteps: {
      findMany: () => prisma.labourStep.findMany({ where: { tenantId } }),

      findById: (id: string) => prisma.labourStep.findFirst({ where: { id, tenantId } }),

      create: (data: CreateLabourStepInput) =>
        prisma.labourStep.create({ data: { ...data, tenantId } }),

      update: (id: string, data: UpdateLabourStepInput) =>
        prisma.labourStep.updateMany({ where: { id, tenantId }, data: { ...data, tenantId: undefined } }),
    },

    consumables: {
      findMany: () => prisma.consumable.findMany({ where: { tenantId } }),

      findById: (id: string) => prisma.consumable.findFirst({ where: { id, tenantId } }),

      create: (data: CreateConsumableInput) =>
        prisma.consumable.create({ data: { ...data, tenantId } }),

      update: (id: string, data: UpdateConsumableInput) =>
        prisma.consumable.updateMany({ where: { id, tenantId }, data: { ...data, tenantId: undefined } }),
    },
  };
}
