import { Prisma } from '@prisma/client';
import { prisma } from './client.js';
import { formatDocumentNumber } from '../lib/numbering.js';

// Job cards aren't given a tenant-configurable prefix (unlike Quote/Invoice's
// quoteNumberPrefix/invoiceNumberPrefix) -- the design spec introduces a
// third TenantSequence type ('job_card') but no corresponding Tenant field,
// so a fixed prefix is used instead.
const JOB_CARD_NUMBER_PREFIX = 'JC';

// Shared by tenantSequences.next() and jobCards.create() below -- both mint
// a document number the same way (upsert-then-increment a per-tenant,
// per-type counter), just for different TenantSequence 'type' values.
async function nextSequenceValue(tenantId: string, type: string): Promise<number> {
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
}

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
  process?: string;
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
  process?: string;
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

export interface CreateScannerInput {
  name: string;
  scannerCost: number;
  expectedScanHours: number;
  powerCostPerHour?: number;
}

export interface UpdateScannerInput {
  name?: string;
  scannerCost?: number;
  expectedScanHours?: number;
  powerCostPerHour?: number;
}

export interface CreateLaserMaterialInput {
  name: string;
  sheetPrice: number;
  sheetAreaM2: number;
  usableSheetAreaM2: number;
  costMultiplier?: number;
}

export interface UpdateLaserMaterialInput {
  name?: string;
  sheetPrice?: number;
  sheetAreaM2?: number;
  usableSheetAreaM2?: number;
  costMultiplier?: number;
}

export interface CreatePremadeItemInput {
  name: string;
  unitCost: number;
  costMultiplier?: number;
}

export interface UpdatePremadeItemInput {
  name?: string;
  unitCost?: number;
  costMultiplier?: number;
}

export interface CreateProductInput {
  name: string;
  category?: string;
  cost: string;
  sellingPrice: string;
}

export interface UpdateProductInput {
  name?: string;
  // string to set, null to explicitly clear, omitted (key absent) to leave untouched.
  category?: string | null;
  cost?: string;
  sellingPrice?: string;
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
  // 'printer' | 'scanner' | 'laser_sheet' | 'laser_premade' -- see the
  // design spec's CostingTemplate.process field. Defaults to 'printer' at
  // the route layer for backward compatibility with pre-v2 callers.
  process?: string;
  filamentId: string | null;
  filamentSnapshotBrand: string | null;
  filamentSnapshotMaterialType: string | null;
  filamentSnapshotCostPerGram: string | null;
  weightGrams: number | null;
  printerId: string | null;
  printerSnapshotName: string | null;
  printerSnapshotElectricityRatePerKwh: string | null;
  printerSnapshotDepreciationPerHour: string | null;
  printerSnapshotPowerDrawWatts: number | null;
  printTimeHours: number | null;
  scannerId?: string | null;
  scannerSnapshotName?: string | null;
  scanHours?: number | null;
  laserMaterialId?: string | null;
  laserMaterialSnapshotName?: string | null;
  sheetAreaUsedM2?: number | null;
  premadeItemId?: string | null;
  premadeItemSnapshotName?: string | null;
  premadeItemQuantity?: number | null;
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
  // Optional (not just nullable) so existing callers that predate discounts
  // (e.g. job-cards.ts's quote-from-costing-template flow, and tests that
  // construct a bare fixture quote) don't have to pass "no discount" through
  // explicitly -- omitting these has the same effect as passing null.
  discountPercent?: string | null;
  discountAppliesTo?: string | null;
  discountAmount?: string;
  vatAmount: string;
  total: string;
  notes: string | null;
  paymentTerms?: string | null;
  termsAndConditionsText?: string | null;
  lineItems: CreateQuoteLineItemInput[];
}

export interface UpdateQuoteInput {
  notes?: string | null;
  paymentTerms?: string | null;
  termsAndConditionsText?: string | null;
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
  // Optional (not just nullable) -- see CreateQuoteInput's matching comment;
  // existing pre-discount callers can simply omit these.
  discountPercent?: string | null;
  discountAppliesTo?: string | null;
  discountAmount?: string;
  vatAmount: string;
  total: string;
  notes: string | null;
  paymentTerms?: string | null;
  termsAndConditionsText?: string | null;
  paymentLinkUrl?: string | null;
  lineItems: CreateInvoiceLineItemInput[];
}

export interface UpdateInvoiceInput {
  notes?: string | null;
  paymentTerms?: string | null;
  termsAndConditionsText?: string | null;
  paymentLinkUrl?: string | null;
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
  pricingNotesText?: string;
  defaultPaymentTerms?: string;
  defaultNotes?: string;
}

// Shape of shopTradingHours -- see updateShopProfileSchema in
// src/routes/shop-profile.ts for the zod validation that enforces this.
export interface TradingHoursDay {
  open: boolean;
  start: string;
  end: string;
}

export type TradingHours = Partial<Record<
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday',
  TradingHoursDay
>>;

export interface UpdateShopProfileInput {
  shopSlug?: string;
  shopTagline?: string;
  shopServices?: string[];
  shopHoursText?: string;
  shopGalleryUrls?: string[];
  shopContactWhatsapp?: string;
  shopIsPublished?: boolean;
  shopAboutText?: string;
  shopAvailability?: string;
  shopGoogleReviewsUrl?: string;
  shopTradingHours?: TradingHours;
  shopFacebookUrl?: string;
  shopInstagramUrl?: string;
  shopTwitterUrl?: string;
  shopTiktokUrl?: string;
  shopYoutubeUrl?: string;
  shopLinkedinUrl?: string;
  shopDiscordUrl?: string;
  shopCults3dUrl?: string;
  shopPrintablesUrl?: string;
  shopThingiverseUrl?: string;
  shopMakerworldUrl?: string;
  shopThangsUrl?: string;
  shopCrealityCloudUrl?: string;
  shopGrabcadUrl?: string;
}

export interface CreateJobInput {
  costingTemplateId: string;
  name: string;
}

export interface JobStatusTimestamps {
  startedAt?: Date;
  completedAt: Date | null;
}

export interface UpdateJobInput {
  notes?: string;
}

// Fields specific to one of JobCard's three cardType variants. Every field is
// sparse (nullable/default-false on the model) and only populated for its
// own cardType -- see the "Data model" section of the design spec for why
// this mirrors CostingTemplate's filament-vs-printer snapshot approach
// rather than a JSON blob.
export interface JobCardTypeFields {
  // Repair
  equipmentMake?: string | null;
  equipmentModel?: string | null;
  equipmentSerial?: string | null;
  reportedFault?: string | null;
  receivedWithPowerCord?: boolean;
  receivedWithFilament?: boolean;
  receivedWithBuildPlate?: boolean;
  receivedWithSdCard?: boolean;
  receivedWithTools?: boolean;
  receivedWithOther?: string | null;
  conditionPrintHead?: string | null;
  conditionPrintBed?: string | null;
  conditionExistingDamage?: string | null;
  technicianFindings?: string | null;

  // Print
  printFileName?: string | null;
  printQuantity?: number | null;
  printWhatIsPrinted?: string | null;
  printProcess?: string | null;
  printMaterial?: string | null;
  printColour?: string | null;
  printQuality?: string | null;
  finishRemoveSupports?: boolean;
  finishDeburrClean?: boolean;
  finishSand?: boolean;
  finishPrime?: boolean;
  finishPaint?: boolean;
  finishPostCure?: boolean;
  finishInstallInserts?: boolean;
  finishAssemble?: boolean;
  resultQuantityAccepted?: number | null;
  resultQuantityRejected?: number | null;
  resultNotes?: string | null;

  // CAD
  cadDesignType?: string | null;
  cadWhatModelMustDo?: string | null;
  cadMaterial?: string | null;
  cadIntendedProcess?: string | null;
  cadTolerances?: string | null;
  cadCriticalDimensions?: string | null;
  deliverableNativeCad?: boolean;
  deliverableStep?: boolean;
  deliverableStl?: boolean;
  deliverable3mf?: boolean;
  deliverableDxf?: boolean;
  deliverableDrawingPdf?: boolean;
  deliverableRenderedImages?: boolean;
  cadApprovedRevision?: string | null;
}

export interface CreateJobCardInput extends JobCardTypeFields {
  cardType: string;
  customerId?: string | null;
  jobTitle: string;
  status?: string;
  priority?: string;
  assignedTo?: string | null;
  receivedDate: Date;
  requiredBy?: Date | null;
  notes?: string | null;
  terms?: string | null;
  receivedBy?: string | null;
}

export interface UpdateJobCardInput extends JobCardTypeFields {
  customerId?: string | null;
  jobTitle?: string;
  status?: string;
  priority?: string;
  assignedTo?: string | null;
  receivedDate?: Date;
  requiredBy?: Date | null;
  notes?: string | null;
  terms?: string | null;
  receivedBy?: string | null;
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

export interface UpdateNotificationPreferenceInput {
  trialEndingInApp?: boolean;
  trialEndingEmail?: boolean;
  lowStockInApp?: boolean;
  lowStockEmail?: boolean;
  invoiceOverdueInApp?: boolean;
  invoiceOverdueEmail?: boolean;
  paymentReceiptInApp?: boolean;
  subscriptionCancelledInApp?: boolean;
  paymentFailedInApp?: boolean;
}

export interface CreateFeatureRequestInput {
  category: string;
  title: string;
  description: string;
}

// One request from the shared community list. Deliberately has no
// `tenantId` (or any other field identifying the submitter) -- see
// `featureRequests.findAll` below for why.
export interface CommunityFeatureRequest {
  id: string;
  category: string;
  title: string;
  description: string;
  status: string;
  createdAt: Date;
  voteCount: number;
  hasVoted: boolean;
}

export type FeatureRequestVoteResult = { status: 'created' } | { status: 'already_voted' };


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
  pricingNotesText: true,
  defaultPaymentTerms: true,
  defaultNotes: true,
} as const;

const shopProfileSelect = {
  shopSlug: true,
  shopTagline: true,
  shopServices: true,
  shopHoursText: true,
  shopGalleryUrls: true,
  shopContactWhatsapp: true,
  shopIsPublished: true,
  shopAboutText: true,
  shopAvailability: true,
  shopGoogleReviewsUrl: true,
  shopTradingHours: true,
  shopFacebookUrl: true,
  shopInstagramUrl: true,
  shopTwitterUrl: true,
  shopTiktokUrl: true,
  shopYoutubeUrl: true,
  shopLinkedinUrl: true,
  shopDiscordUrl: true,
  shopCults3dUrl: true,
  shopPrintablesUrl: true,
  shopThingiverseUrl: true,
  shopMakerworldUrl: true,
  shopThangsUrl: true,
  shopCrealityCloudUrl: true,
  shopGrabcadUrl: true,
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

      // Batch lookup for resolving multiple references (e.g. costing template
      // labour lines) in one round trip instead of one findById per id. Tenant
      // scoping is enforced the same way as findById -- rows belonging to
      // another tenant are simply absent from the result, same as a miss.
      findManyByIds: (ids: string[]) =>
        ids.length === 0 ? Promise.resolve([]) : prisma.labourStep.findMany({ where: { id: { in: ids }, tenantId } }),

      create: (data: CreateLabourStepInput) =>
        prisma.labourStep.create({ data: { ...data, tenantId } }),

      update: (id: string, data: UpdateLabourStepInput) =>
        prisma.labourStep.updateMany({ where: { id, tenantId }, data: { ...data, tenantId: undefined } }),
    },

    consumables: {
      findMany: () => prisma.consumable.findMany({ where: { tenantId } }),

      findById: (id: string) => prisma.consumable.findFirst({ where: { id, tenantId } }),

      // See labourSteps.findManyByIds -- same batch-lookup, same tenant scoping.
      findManyByIds: (ids: string[]) =>
        ids.length === 0 ? Promise.resolve([]) : prisma.consumable.findMany({ where: { id: { in: ids }, tenantId } }),

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
            process: data.process ?? 'printer',
            filamentId: data.filamentId,
            filamentSnapshotBrand: data.filamentSnapshotBrand,
            filamentSnapshotMaterialType: data.filamentSnapshotMaterialType,
            filamentSnapshotCostPerGram: data.filamentSnapshotCostPerGram,
            weightGrams: data.weightGrams,
            printerId: data.printerId,
            printerSnapshotName: data.printerSnapshotName,
            printerSnapshotElectricityRatePerKwh: data.printerSnapshotElectricityRatePerKwh,
            printerSnapshotDepreciationPerHour: data.printerSnapshotDepreciationPerHour,
            printerSnapshotPowerDrawWatts: data.printerSnapshotPowerDrawWatts,
            printTimeHours: data.printTimeHours,
            scannerId: data.scannerId ?? null,
            scannerSnapshotName: data.scannerSnapshotName ?? null,
            scanHours: data.scanHours ?? null,
            laserMaterialId: data.laserMaterialId ?? null,
            laserMaterialSnapshotName: data.laserMaterialSnapshotName ?? null,
            sheetAreaUsedM2: data.sheetAreaUsedM2 ?? null,
            premadeItemId: data.premadeItemId ?? null,
            premadeItemSnapshotName: data.premadeItemSnapshotName ?? null,
            premadeItemQuantity: data.premadeItemQuantity ?? null,
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

    scanners: {
      findMany: () => prisma.scanner.findMany({ where: { tenantId } }),

      findById: (id: string) => prisma.scanner.findFirst({ where: { id, tenantId } }),

      create: (data: CreateScannerInput) => prisma.scanner.create({ data: { ...data, tenantId } }),

      update: (id: string, data: UpdateScannerInput) =>
        prisma.scanner.updateMany({ where: { id, tenantId }, data: { ...data, tenantId: undefined } }),

      delete: (id: string) => prisma.scanner.deleteMany({ where: { id, tenantId } }),
    },

    laserMaterials: {
      findMany: () => prisma.laserMaterial.findMany({ where: { tenantId } }),

      findById: (id: string) => prisma.laserMaterial.findFirst({ where: { id, tenantId } }),

      create: (data: CreateLaserMaterialInput) => prisma.laserMaterial.create({ data: { ...data, tenantId } }),

      update: (id: string, data: UpdateLaserMaterialInput) =>
        prisma.laserMaterial.updateMany({ where: { id, tenantId }, data: { ...data, tenantId: undefined } }),

      delete: (id: string) => prisma.laserMaterial.deleteMany({ where: { id, tenantId } }),
    },

    premadeItems: {
      findMany: () => prisma.premadeItem.findMany({ where: { tenantId } }),

      findById: (id: string) => prisma.premadeItem.findFirst({ where: { id, tenantId } }),

      create: (data: CreatePremadeItemInput) => prisma.premadeItem.create({ data: { ...data, tenantId } }),

      update: (id: string, data: UpdatePremadeItemInput) =>
        prisma.premadeItem.updateMany({ where: { id, tenantId }, data: { ...data, tenantId: undefined } }),

      delete: (id: string) => prisma.premadeItem.deleteMany({ where: { id, tenantId } }),
    },

    products: {
      findMany: () => prisma.product.findMany({ where: { tenantId } }),

      findById: (id: string) => prisma.product.findFirst({ where: { id, tenantId } }),

      create: (data: CreateProductInput) => prisma.product.create({ data: { ...data, tenantId } }),

      update: (id: string, data: UpdateProductInput) =>
        prisma.product.updateMany({
          where: { id, tenantId },
          data: {
            ...data,
            // 'category' in data distinguishes "key omitted" (undefined here ->
            // don't touch it) from "explicitly null" (clear it) — same
            // three-state pattern used elsewhere in this file.
            category: 'category' in data ? (data.category ?? null) : undefined,
            tenantId: undefined,
          },
        }),

      delete: (id: string) => prisma.product.deleteMany({ where: { id, tenantId } }),
    },

    companyProfile: {
      get: () => prisma.tenant.findUnique({ where: { id: tenantId }, select: companyProfileSelect }),

      update: (data: UpdateCompanyProfileInput) =>
        prisma.tenant.update({ where: { id: tenantId }, data, select: companyProfileSelect }),
    },

    shopProfile: {
      get: () => prisma.tenant.findUnique({ where: { id: tenantId }, select: shopProfileSelect }),

      // shopTradingHours is cast to Prisma's Json input type here rather than
      // widened on TradingHoursDay itself -- the plain, precisely-shaped
      // TradingHoursDay is what the route's zod schema and the frontend both
      // work with, and Prisma's InputJsonValue only needs to be satisfied at
      // this one boundary where the value is actually handed to the client.
      update: (data: UpdateShopProfileInput) =>
        prisma.tenant.update({
          where: { id: tenantId },
          data: {
            ...data,
            shopTradingHours: data.shopTradingHours as Prisma.InputJsonValue | undefined,
          },
          select: shopProfileSelect,
        }),
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
            discountPercent: data.discountPercent,
            discountAppliesTo: data.discountAppliesTo,
            discountAmount: data.discountAmount,
            vatAmount: data.vatAmount,
            total: data.total,
            notes: data.notes,
            paymentTerms: data.paymentTerms,
            termsAndConditionsText: data.termsAndConditionsText,
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

      update: async (id: string, data: UpdateQuoteInput) => {
        const result = await prisma.quote.updateMany({
          where: { id, tenantId },
          data: {
            // 'field' in data distinguishes "key omitted" (undefined here ->
            // don't touch it) from "explicitly null" (clear it) — same
            // three-state pattern used elsewhere in this file.
            notes: 'notes' in data ? (data.notes ?? null) : undefined,
            paymentTerms: 'paymentTerms' in data ? (data.paymentTerms ?? null) : undefined,
            termsAndConditionsText:
              'termsAndConditionsText' in data ? (data.termsAndConditionsText ?? null) : undefined,
          },
        });
        if (result.count === 0) {
          return null;
        }
        return prisma.quote.findFirst({ where: { id, tenantId }, include: { lineItems: true } });
      },
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
            discountPercent: data.discountPercent,
            discountAppliesTo: data.discountAppliesTo,
            discountAmount: data.discountAmount,
            vatAmount: data.vatAmount,
            total: data.total,
            notes: data.notes,
            paymentTerms: data.paymentTerms,
            termsAndConditionsText: data.termsAndConditionsText,
            paymentLinkUrl: data.paymentLinkUrl,
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

      update: async (id: string, data: UpdateInvoiceInput) => {
        const result = await prisma.invoice.updateMany({
          where: { id, tenantId },
          data: {
            // 'field' in data distinguishes "key omitted" (undefined here ->
            // don't touch it) from "explicitly null" (clear it) — same
            // three-state pattern used elsewhere in this file.
            notes: 'notes' in data ? (data.notes ?? null) : undefined,
            paymentTerms: 'paymentTerms' in data ? (data.paymentTerms ?? null) : undefined,
            termsAndConditionsText:
              'termsAndConditionsText' in data ? (data.termsAndConditionsText ?? null) : undefined,
            paymentLinkUrl: 'paymentLinkUrl' in data ? (data.paymentLinkUrl ?? null) : undefined,
          },
        });
        if (result.count === 0) {
          return null;
        }
        return prisma.invoice.findFirst({ where: { id, tenantId }, include: { lineItems: true } });
      },
    },

    tenantSequences: {
      next: (type: 'quote' | 'invoice' | 'job_card') => nextSequenceValue(tenantId, type),
    },

    jobs: {
      findMany: () => prisma.job.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),

      findById: (id: string) => prisma.job.findFirst({ where: { id, tenantId } }),

      create: (data: CreateJobInput) =>
        prisma.job.create({ data: { ...data, tenantId } }),

      updateStatus: async (id: string, status: string, timestamps: JobStatusTimestamps) => {
        const result = await prisma.job.updateMany({
          where: { id, tenantId },
          data: { status, startedAt: timestamps.startedAt, completedAt: timestamps.completedAt },
        });
        if (result.count === 0) {
          return null;
        }
        return prisma.job.findFirst({ where: { id, tenantId } });
      },

      update: async (id: string, data: UpdateJobInput) => {
        const result = await prisma.job.updateMany({
          where: { id, tenantId },
          data: {
            // 'notes' in data distinguishes "key omitted" (undefined here ->
            // don't touch it) from "explicitly null" (clear it) — same
            // three-state pattern as Printer/Filament's optional fields above.
            notes: 'notes' in data ? (data.notes ?? null) : undefined,
          },
        });
        if (result.count === 0) {
          return null;
        }
        return prisma.job.findFirst({ where: { id, tenantId } });
      },
    },

    jobCards: {
      findMany: () => prisma.jobCard.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),

      findById: (id: string) => prisma.jobCard.findFirst({ where: { id, tenantId } }),

      create: async (data: CreateJobCardInput) => {
        // Mints its own document number (unlike quotes/invoices, which have
        // the calling route pull one via tenantSequences.next() before
        // calling create) -- see the design spec's Backend section.
        const sequenceValue = await nextSequenceValue(tenantId, 'job_card');
        const number = formatDocumentNumber(JOB_CARD_NUMBER_PREFIX, sequenceValue);
        return prisma.jobCard.create({ data: { ...data, tenantId, number } });
      },

      update: async (id: string, data: UpdateJobCardInput) => {
        const result = await prisma.jobCard.updateMany({
          where: { id, tenantId },
          data: {
            jobTitle: data.jobTitle,
            status: data.status,
            priority: data.priority,
            // 'field' in data distinguishes "key omitted" (undefined here ->
            // don't touch it) from "explicitly null" (clear it) -- same
            // three-state pattern as Printer/Filament/Job's optional fields.
            customerId: 'customerId' in data ? (data.customerId ?? null) : undefined,
            assignedTo: 'assignedTo' in data ? (data.assignedTo ?? null) : undefined,
            receivedDate: data.receivedDate,
            requiredBy: 'requiredBy' in data ? (data.requiredBy ?? null) : undefined,
            notes: 'notes' in data ? (data.notes ?? null) : undefined,
            terms: 'terms' in data ? (data.terms ?? null) : undefined,
            receivedBy: 'receivedBy' in data ? (data.receivedBy ?? null) : undefined,

            // Repair
            equipmentMake: 'equipmentMake' in data ? (data.equipmentMake ?? null) : undefined,
            equipmentModel: 'equipmentModel' in data ? (data.equipmentModel ?? null) : undefined,
            equipmentSerial: 'equipmentSerial' in data ? (data.equipmentSerial ?? null) : undefined,
            reportedFault: 'reportedFault' in data ? (data.reportedFault ?? null) : undefined,
            receivedWithPowerCord: data.receivedWithPowerCord,
            receivedWithFilament: data.receivedWithFilament,
            receivedWithBuildPlate: data.receivedWithBuildPlate,
            receivedWithSdCard: data.receivedWithSdCard,
            receivedWithTools: data.receivedWithTools,
            receivedWithOther: 'receivedWithOther' in data ? (data.receivedWithOther ?? null) : undefined,
            conditionPrintHead: 'conditionPrintHead' in data ? (data.conditionPrintHead ?? null) : undefined,
            conditionPrintBed: 'conditionPrintBed' in data ? (data.conditionPrintBed ?? null) : undefined,
            conditionExistingDamage:
              'conditionExistingDamage' in data ? (data.conditionExistingDamage ?? null) : undefined,
            technicianFindings: 'technicianFindings' in data ? (data.technicianFindings ?? null) : undefined,

            // Print
            printFileName: 'printFileName' in data ? (data.printFileName ?? null) : undefined,
            printQuantity: 'printQuantity' in data ? (data.printQuantity ?? null) : undefined,
            printWhatIsPrinted: 'printWhatIsPrinted' in data ? (data.printWhatIsPrinted ?? null) : undefined,
            printProcess: 'printProcess' in data ? (data.printProcess ?? null) : undefined,
            printMaterial: 'printMaterial' in data ? (data.printMaterial ?? null) : undefined,
            printColour: 'printColour' in data ? (data.printColour ?? null) : undefined,
            printQuality: 'printQuality' in data ? (data.printQuality ?? null) : undefined,
            finishRemoveSupports: data.finishRemoveSupports,
            finishDeburrClean: data.finishDeburrClean,
            finishSand: data.finishSand,
            finishPrime: data.finishPrime,
            finishPaint: data.finishPaint,
            finishPostCure: data.finishPostCure,
            finishInstallInserts: data.finishInstallInserts,
            finishAssemble: data.finishAssemble,
            resultQuantityAccepted:
              'resultQuantityAccepted' in data ? (data.resultQuantityAccepted ?? null) : undefined,
            resultQuantityRejected:
              'resultQuantityRejected' in data ? (data.resultQuantityRejected ?? null) : undefined,
            resultNotes: 'resultNotes' in data ? (data.resultNotes ?? null) : undefined,

            // CAD
            cadDesignType: 'cadDesignType' in data ? (data.cadDesignType ?? null) : undefined,
            cadWhatModelMustDo: 'cadWhatModelMustDo' in data ? (data.cadWhatModelMustDo ?? null) : undefined,
            cadMaterial: 'cadMaterial' in data ? (data.cadMaterial ?? null) : undefined,
            cadIntendedProcess: 'cadIntendedProcess' in data ? (data.cadIntendedProcess ?? null) : undefined,
            cadTolerances: 'cadTolerances' in data ? (data.cadTolerances ?? null) : undefined,
            cadCriticalDimensions: 'cadCriticalDimensions' in data ? (data.cadCriticalDimensions ?? null) : undefined,
            deliverableNativeCad: data.deliverableNativeCad,
            deliverableStep: data.deliverableStep,
            deliverableStl: data.deliverableStl,
            deliverable3mf: data.deliverable3mf,
            deliverableDxf: data.deliverableDxf,
            deliverableDrawingPdf: data.deliverableDrawingPdf,
            deliverableRenderedImages: data.deliverableRenderedImages,
            cadApprovedRevision: 'cadApprovedRevision' in data ? (data.cadApprovedRevision ?? null) : undefined,

            tenantId: undefined,
          },
        });
        if (result.count === 0) {
          return null;
        }
        return prisma.jobCard.findFirst({ where: { id, tenantId } });
      },

      linkQuote: async (id: string, quoteId: string) => {
        const result = await prisma.jobCard.updateMany({ where: { id, tenantId }, data: { quoteId } });
        if (result.count === 0) {
          return null;
        }
        return prisma.jobCard.findFirst({ where: { id, tenantId } });
      },
    },

    notifications: {
      findMany: (unreadOnly?: boolean) =>
        prisma.notification.findMany({
          where: { tenantId, ...(unreadOnly ? { readAt: null } : {}) },
          orderBy: { createdAt: 'desc' },
        }),

      markRead: async (id: string) => {
        const result = await prisma.notification.updateMany({
          where: { id, tenantId },
          data: { readAt: new Date() },
        });
        if (result.count === 0) {
          return null;
        }
        return prisma.notification.findFirst({ where: { id, tenantId } });
      },

      markAllRead: () =>
        prisma.notification.updateMany({
          where: { tenantId, readAt: null },
          data: { readAt: new Date() },
        }),
    },

    featureRequests: {
      // This tenant's own submissions -- genuinely tenant-scoped, same as
      // every other accessor in this file.
      findMyRequests: () =>
        prisma.featureRequest.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),

      // DELIBERATELY NOT TENANT-SCOPED. Feature requests are a shared,
      // cross-tenant community roadmap (see the design spec's "Scope
      // decision" section) -- every tenant's requests are visible to every
      // other tenant, which is the entire point of a "Community requests"
      // list. This is the one accessor in this file whose query doesn't
      // filter by `tenantId`; it still lives under `tenantScope()` for
      // consistency with every other accessor here (and because it still
      // needs `tenantId` below, to compute THIS tenant's own `hasVoted`
      // flag), not because it forgot to scope. Do not "fix" this to filter
      // by tenantId -- that would break the community list.
      //
      // The `select` below also intentionally omits `tenantId` (and
      // anything else that could identify the submitter) from every
      // returned row, so the submitting tenant's identity can never leak
      // through this response, however this list is later serialized.
      findAll: async (sort: 'votes' | 'recent'): Promise<CommunityFeatureRequest[]> => {
        const requests = await prisma.featureRequest.findMany({
          select: {
            id: true,
            category: true,
            title: true,
            description: true,
            status: true,
            createdAt: true,
            _count: { select: { votes: true } },
          },
          orderBy:
            sort === 'votes'
              ? [{ votes: { _count: 'desc' } }, { createdAt: 'desc' }]
              : { createdAt: 'desc' },
        });

        // A single extra query for which of these requests THIS tenant has
        // voted on, rather than a per-row lookup -- this is the "current
        // tenant's own vote state", not the submitter identity, so it's safe
        // to compute from `tenantId` here.
        const myVotes = await prisma.featureRequestVote.findMany({
          where: { tenantId, featureRequestId: { in: requests.map((r) => r.id) } },
          select: { featureRequestId: true },
        });
        const votedIds = new Set(myVotes.map((v) => v.featureRequestId));

        return requests.map((r) => ({
          id: r.id,
          category: r.category,
          title: r.title,
          description: r.description,
          status: r.status,
          createdAt: r.createdAt,
          voteCount: r._count.votes,
          hasVoted: votedIds.has(r.id),
        }));
      },

      create: (data: CreateFeatureRequestInput) =>
        prisma.featureRequest.create({ data: { ...data, tenantId } }),

      // Creates this tenant's vote row. Relies on the `@@unique([featureRequestId,
      // tenantId])` constraint on FeatureRequestVote to prevent a double vote --
      // catches its P2002 and reports "already voted" rather than pre-checking
      // then inserting, so this stays correct under concurrent double-clicks.
      vote: async (featureRequestId: string): Promise<FeatureRequestVoteResult> => {
        try {
          await prisma.featureRequestVote.create({ data: { featureRequestId, tenantId } });
          return { status: 'created' };
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return { status: 'already_voted' };
          }
          throw error;
        }
      },

      unvote: (featureRequestId: string) =>
        prisma.featureRequestVote.deleteMany({ where: { featureRequestId, tenantId } }),

      voteCount: (featureRequestId: string) =>
        prisma.featureRequestVote.count({ where: { featureRequestId } }),
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

    notificationPreference: {
      get: () => prisma.notificationPreference.findUnique({ where: { tenantId } }),

      // All-`true` defaults on first access — mirrors the tenant-row-exists
      // upsert pattern used for companyProfile/shopProfile elsewhere in this
      // file (those piggyback on the Tenant row itself; this one is its own
      // table, so an explicit upsert is needed instead).
      getOrCreate: () =>
        prisma.notificationPreference.upsert({
          where: { tenantId },
          create: { tenantId },
          update: {},
        }),

      update: (data: UpdateNotificationPreferenceInput) =>
        prisma.notificationPreference.update({ where: { tenantId }, data }),
    },
  };
}
