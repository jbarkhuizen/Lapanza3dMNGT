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
  electricityRatePerKwh?: number;
  expectedLifetimeHours?: number;
  status?: string;
}

export interface UpdatePrinterInput {
  name?: string;
  make?: string;
  model?: string;
  // number to set, null to explicitly clear, omitted (key absent) to leave untouched.
  buildVolumeXMm?: number | null;
  buildVolumeYMm?: number | null;
  buildVolumeZMm?: number | null;
  // string to set, null to explicitly clear, omitted (key absent) to leave untouched.
  purchaseDate?: string | null;
  // number to set, null to explicitly clear, omitted (key absent) to leave untouched.
  purchaseCost?: number | null;
  powerDrawWatts?: number | null;
  electricityRatePerKwh?: number | null;
  expectedLifetimeHours?: number | null;
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
  // number to set, null to explicitly clear, omitted (key absent) to leave untouched.
  costPerSpool?: number | null;
  costPerKg?: number | null;
  spoolWeightGrams?: number | null;
  remainingWeightGrams?: number | null;
  supplier?: string;
  // string to set, null to explicitly clear, omitted (key absent) to leave untouched.
  purchaseDate?: string | null;
  notes?: string;
  // number to set, null to explicitly clear, omitted (key absent) to leave untouched.
  lowStockThresholdGrams?: number | null;
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
  // number to set, null to explicitly clear, omitted (key absent) to leave untouched.
  // (currentStock has no null variant: the column is non-nullable with a DB default.)
  reorderThreshold?: number | null;
  supplier?: string;
}

export interface CreateCostingTemplateLabourLineInput {
  labourStepId: string | null;
  labourStepSnapshotName: string;
  hourlyRateSnapshot: string;
  hours: number;
  lineCost: string;
}

export interface CreateCostingTemplateConsumableLineInput {
  consumableId: string | null;
  consumableSnapshotName: string;
  costPerUnitSnapshot: string;
  quantity: number;
  lineCost: string;
}

export interface CreateCostingTemplateInput {
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
  labourLines: CreateCostingTemplateLabourLineInput[];
  consumableLines: CreateCostingTemplateConsumableLineInput[];
}

export interface CreateQuoteLineItemInput {
  costingTemplateId: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface CreateQuoteInput {
  customerId: string;
  number: string;
  validUntil: Date | null;
  vatApplied: boolean;
  subtotal: string;
  vatAmount: string;
  total: string;
  notes: string | null;
  lineItems: CreateQuoteLineItemInput[];
}

export interface CreateInvoiceLineItemInput {
  quoteLineItemId: string | null;
  costingTemplateId: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface CreateInvoiceInput {
  customerId: string;
  quoteId: string | null;
  number: string;
  dueDate: Date;
  vatApplied: boolean;
  subtotal: string;
  vatAmount: string;
  total: string;
  notes: string | null;
  lineItems: CreateInvoiceLineItemInput[];
}

export interface UpdateCompanyProfileInput {
  businessName?: string;
  contactName?: string;
  registrationNumber?: string;
  vatRegistered?: boolean;
  vatNumber?: string;
  logoUrl?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postalCode?: string;
  phone?: string;
  website?: string;
  bankName?: string;
  bankAccountHolder?: string;
  bankAccountNumber?: string;
  bankBranchCode?: string;
  termsAndConditionsText?: string;
  defaultCurrency?: string;
  defaultQuoteValidityDays?: number;
  quoteNumberPrefix?: string;
  invoiceNumberPrefix?: string;
}

export interface CreateSubscriptionInput {
  // Pre-generated by the checkout route BEFORE calling the payment
  // provider, so it can be used as PayFast's m_payment_id correlation
  // token — see billing.ts. Optional so other callers (tests, seed
  // helpers) can omit it and let the schema's @default(uuid()) apply.
  id?: string;
  planId: string;
  status: string;
  paymentProvider: string;
  trialEndsAt: Date;
  providerSubscriptionId?: string;
  currentPeriodEnd?: Date;
}

export interface UpdateSubscriptionExtra {
  providerSubscriptionId?: string;
  currentPeriodEnd?: Date;
  pastDueSince?: Date | null;
}

const companyProfileSelect = {
  businessName: true,
  contactName: true,
  email: true,
  registrationNumber: true,
  vatRegistered: true,
  vatNumber: true,
  logoUrl: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  postalCode: true,
  phone: true,
  website: true,
  bankName: true,
  bankAccountHolder: true,
  bankAccountNumber: true,
  bankBranchCode: true,
  termsAndConditionsText: true,
  defaultCurrency: true,
  defaultQuoteValidityDays: true,
  quoteNumberPrefix: true,
  invoiceNumberPrefix: true,
} as const;

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

      update: async (id: string, data: UpdateCustomerInput) => {
        const result = await prisma.customer.updateMany({
          where: { id, tenantId },
          data: { ...data, tenantId: undefined },
        });
        if (result.count === 0) {
          return null;
        }
        return prisma.customer.findFirst({ where: { id, tenantId } });
      },
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
            // 'purchaseDate' in data distinguishes "key omitted" (undefined
            // here -> don't touch it) from "explicitly null" (clear it) --
            // `data.purchaseDate ? ... : undefined` couldn't tell those apart.
            purchaseDate: 'purchaseDate' in data
              ? (data.purchaseDate ? new Date(data.purchaseDate) : null)
              : undefined,
            // Same three-state pattern as purchaseDate above, applied to every
            // optional numeric field so an explicit `null` clears it instead of
            // being silently dropped by JSON.stringify on the client.
            buildVolumeXMm: 'buildVolumeXMm' in data ? (data.buildVolumeXMm ?? null) : undefined,
            buildVolumeYMm: 'buildVolumeYMm' in data ? (data.buildVolumeYMm ?? null) : undefined,
            buildVolumeZMm: 'buildVolumeZMm' in data ? (data.buildVolumeZMm ?? null) : undefined,
            purchaseCost: 'purchaseCost' in data ? (data.purchaseCost ?? null) : undefined,
            powerDrawWatts: 'powerDrawWatts' in data ? (data.powerDrawWatts ?? null) : undefined,
            electricityRatePerKwh: 'electricityRatePerKwh' in data ? (data.electricityRatePerKwh ?? null) : undefined,
            expectedLifetimeHours: 'expectedLifetimeHours' in data ? (data.expectedLifetimeHours ?? null) : undefined,
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
            // 'purchaseDate' in data distinguishes "key omitted" (undefined
            // here -> don't touch it) from "explicitly null" (clear it) --
            // `data.purchaseDate ? ... : undefined` couldn't tell those apart.
            purchaseDate: 'purchaseDate' in data
              ? (data.purchaseDate ? new Date(data.purchaseDate) : null)
              : undefined,
            // Same three-state pattern as purchaseDate above, applied to every
            // optional numeric field so an explicit `null` clears it instead of
            // being silently dropped by JSON.stringify on the client.
            costPerSpool: 'costPerSpool' in data ? (data.costPerSpool ?? null) : undefined,
            costPerKg: 'costPerKg' in data ? (data.costPerKg ?? null) : undefined,
            spoolWeightGrams: 'spoolWeightGrams' in data ? (data.spoolWeightGrams ?? null) : undefined,
            remainingWeightGrams: 'remainingWeightGrams' in data ? (data.remainingWeightGrams ?? null) : undefined,
            lowStockThresholdGrams: 'lowStockThresholdGrams' in data ? (data.lowStockThresholdGrams ?? null) : undefined,
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
        prisma.consumable.updateMany({
          where: { id, tenantId },
          data: {
            ...data,
            // 'reorderThreshold' in data distinguishes "key omitted" (undefined
            // here -> don't touch it) from "explicitly null" (clear it) --
            // `data.reorderThreshold ?? undefined` couldn't tell those apart.
            reorderThreshold: 'reorderThreshold' in data ? (data.reorderThreshold ?? null) : undefined,
            tenantId: undefined,
          },
        }),
    },

    costingTemplates: {
      findMany: () =>
        prisma.costingTemplate.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),

      findById: (id: string) =>
        prisma.costingTemplate.findFirst({
          where: { id, tenantId },
          include: { labourLines: true, consumableLines: true },
        }),

      create: (data: CreateCostingTemplateInput) =>
        prisma.costingTemplate.create({
          data: {
            tenantId,
            name: data.name,
            filamentId: data.filamentId,
            filamentSnapshotBrand: data.filamentSnapshotBrand,
            filamentSnapshotMaterialType: data.filamentSnapshotMaterialType,
            filamentSnapshotCostPerGram: data.filamentSnapshotCostPerGram,
            weightGrams: data.weightGrams,
            printerId: data.printerId,
            printerSnapshotName: data.printerSnapshotName,
            printerSnapshotElectricityRatePerKwh: data.printerSnapshotElectricityRatePerKwh,
            printerSnapshotDepreciationPerHour: data.printerSnapshotDepreciationPerHour,
            printTimeHours: data.printTimeHours,
            markupPercent: data.markupPercent,
            filamentCost: data.filamentCost,
            electricityCost: data.electricityCost,
            depreciationCost: data.depreciationCost,
            labourCost: data.labourCost,
            consumablesCost: data.consumablesCost,
            totalCost: data.totalCost,
            suggestedPrice: data.suggestedPrice,
            labourLines: {
              create: data.labourLines.map((line) => ({
                tenantId,
                labourStepId: line.labourStepId,
                labourStepSnapshotName: line.labourStepSnapshotName,
                hourlyRateSnapshot: line.hourlyRateSnapshot,
                hours: line.hours,
                lineCost: line.lineCost,
              })),
            },
            consumableLines: {
              create: data.consumableLines.map((line) => ({
                tenantId,
                consumableId: line.consumableId,
                consumableSnapshotName: line.consumableSnapshotName,
                costPerUnitSnapshot: line.costPerUnitSnapshot,
                quantity: line.quantity,
                lineCost: line.lineCost,
              })),
            },
          },
          include: { labourLines: true, consumableLines: true },
        }),
    },

    companyProfile: {
      get: () => prisma.tenant.findUnique({ where: { id: tenantId }, select: companyProfileSelect }),

      update: (data: UpdateCompanyProfileInput) =>
        prisma.tenant.update({ where: { id: tenantId }, data, select: companyProfileSelect }),
    },

    quotes: {
      findMany: () => prisma.quote.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),

      findById: (id: string) =>
        prisma.quote.findFirst({ where: { id, tenantId }, include: { lineItems: true } }),

      create: (data: CreateQuoteInput) =>
        prisma.quote.create({
          data: {
            tenantId,
            customerId: data.customerId,
            number: data.number,
            validUntil: data.validUntil,
            vatApplied: data.vatApplied,
            subtotal: data.subtotal,
            vatAmount: data.vatAmount,
            total: data.total,
            notes: data.notes,
            lineItems: {
              create: data.lineItems.map((line) => ({
                tenantId,
                costingTemplateId: line.costingTemplateId,
                description: line.description,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                lineTotal: line.lineTotal,
              })),
            },
          },
          include: { lineItems: true },
        }),

      updateStatus: (id: string, status: string) =>
        prisma.quote.updateMany({ where: { id, tenantId }, data: { status } }),
    },

    invoices: {
      findMany: () => prisma.invoice.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),

      findById: (id: string) =>
        prisma.invoice.findFirst({ where: { id, tenantId }, include: { lineItems: true } }),

      create: (data: CreateInvoiceInput) =>
        prisma.invoice.create({
          data: {
            tenantId,
            customerId: data.customerId,
            quoteId: data.quoteId,
            number: data.number,
            dueDate: data.dueDate,
            vatApplied: data.vatApplied,
            subtotal: data.subtotal,
            vatAmount: data.vatAmount,
            total: data.total,
            notes: data.notes,
            lineItems: {
              create: data.lineItems.map((line) => ({
                tenantId,
                quoteLineItemId: line.quoteLineItemId,
                costingTemplateId: line.costingTemplateId,
                description: line.description,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                lineTotal: line.lineTotal,
              })),
            },
          },
          include: { lineItems: true },
        }),

      updateStatus: (id: string, status: string, amountPaid?: string) =>
        prisma.invoice.updateMany({
          where: { id, tenantId },
          data: { status, ...(amountPaid !== undefined ? { amountPaid } : {}) },
        }),
    },

    tenantSequences: {
      next: async (type: 'quote' | 'invoice') => {
        await prisma.tenantSequence.upsert({
          where: { tenantId_type: { tenantId, type } },
          create: { tenantId, type, value: 0 },
          update: {},
        });
        const updated = await prisma.tenantSequence.update({
          where: { tenantId_type: { tenantId, type } },
          data: { value: { increment: 1 } },
        });
        return updated.value;
      },
    },

    subscription: {
      get: () =>
        prisma.subscription.findUnique({ where: { tenantId }, include: { plan: true } }),

      create: (data: CreateSubscriptionInput) =>
        prisma.subscription.create({ data: { ...data, tenantId }, include: { plan: true } }),

      updateStatus: (status: string, extra?: UpdateSubscriptionExtra) =>
        prisma.subscription.updateMany({ where: { tenantId }, data: { status, ...extra } }),

      delete: () => prisma.subscription.deleteMany({ where: { tenantId } }),
    },
  };
}
