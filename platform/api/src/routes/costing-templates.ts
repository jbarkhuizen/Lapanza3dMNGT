import { Router } from 'express';
import { z } from 'zod';
import type { CostingTemplate, CostingLabourLine, CostingConsumableLine } from '@prisma/client';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { tenantScope } from '../db/scoped.js';
import { calculateCosting, calculateScannerCosting, calculateLaserCosting, CostingInputError } from '../costing/calculate.js';

export const costingTemplatesRouter = Router();
// Auth/subscription gating is applied per-route (not via a blanket
// `.use()`) so a genuinely unmatched path that falls through to this
// router doesn't get a misleading 401 — it falls through to the next
// router / app.ts's final 404 handler instead. See backlog #6.

// Same reasoning as printers.ts's serializePrinter(): Prisma's Decimal
// normalizes trailing zeros away by default, so fix the display scale to
// match each column's declared precision only here, at the HTTP boundary —
// scoped.ts and calculateCosting keep working with real Decimal instances.
type CostingTemplateWithOptionalLines = CostingTemplate & {
  labourLines?: CostingLabourLine[];
  consumableLines?: CostingConsumableLine[];
};

function serializeCostingTemplate(template: CostingTemplateWithOptionalLines) {
  return {
    ...template,
    filamentSnapshotCostPerGram:
      template.filamentSnapshotCostPerGram != null ? template.filamentSnapshotCostPerGram.toFixed(6) : null,
    printerSnapshotElectricityRatePerKwh:
      template.printerSnapshotElectricityRatePerKwh != null
        ? template.printerSnapshotElectricityRatePerKwh.toFixed(4)
        : null,
    printerSnapshotDepreciationPerHour:
      template.printerSnapshotDepreciationPerHour != null
        ? template.printerSnapshotDepreciationPerHour.toFixed(4)
        : null,
    // Plain Float, unlike the two snapshot fields above (Decimal columns) —
    // no toFixed() normalization needed, matches Printer.powerDrawWatts's own type.
    printerSnapshotPowerDrawWatts: template.printerSnapshotPowerDrawWatts,
    markupPercent: template.markupPercent.toFixed(2),
    filamentCost: template.filamentCost.toFixed(2),
    electricityCost: template.electricityCost.toFixed(2),
    depreciationCost: template.depreciationCost.toFixed(2),
    labourCost: template.labourCost.toFixed(2),
    consumablesCost: template.consumablesCost.toFixed(2),
    totalCost: template.totalCost.toFixed(2),
    suggestedPrice: template.suggestedPrice.toFixed(2),
    labourLines: template.labourLines?.map((line) => ({
      ...line,
      hourlyRateSnapshot: line.hourlyRateSnapshot.toFixed(2),
      lineCost: line.lineCost.toFixed(2),
    })),
    consumableLines: template.consumableLines?.map((line) => ({
      ...line,
      costPerUnitSnapshot: line.costPerUnitSnapshot.toFixed(2),
      lineCost: line.lineCost.toFixed(2),
    })),
  };
}

const labourLineSchema = z.object({
  labourStepId: z.string().min(1),
  hours: z.number().positive(),
});

const consumableLineSchema = z.object({
  consumableId: z.string().min(1),
  quantity: z.number().positive(),
});

// Fields shared by every process variant below.
const sharedFields = {
  name: z.string().min(1),
  markupPercent: z.number().min(0).max(9999.99),
  labourLines: z.array(labourLineSchema).default([]),
  consumableLines: z.array(consumableLineSchema).default([]),
};

// A discriminated union on `process` -- each variant is `.strict()`, so a
// `scanner`-typed request that includes e.g. `filamentId` is rejected
// outright rather than silently ignored, same technique JobCard's
// discriminated union uses in job-cards.ts for its `cardType`.
const printerVariantSchema = z
  .object({
    process: z.literal('printer'),
    ...sharedFields,
    filamentId: z.string().min(1),
    weightGrams: z.number().positive(),
    printerId: z.string().min(1),
    printTimeHours: z.number().positive(),
  })
  .strict();

const scannerVariantSchema = z
  .object({
    process: z.literal('scanner'),
    ...sharedFields,
    scannerId: z.string().min(1),
    scanHours: z.number().positive(),
  })
  .strict();

const laserSheetVariantSchema = z
  .object({
    process: z.literal('laser_sheet'),
    ...sharedFields,
    laserMaterialId: z.string().min(1),
    sheetAreaUsedM2: z.number().positive(),
  })
  .strict();

const laserPremadeVariantSchema = z
  .object({
    process: z.literal('laser_premade'),
    ...sharedFields,
    premadeItemId: z.string().min(1),
    premadeItemQuantity: z.number().int().positive(),
  })
  .strict();

// `process` defaults to 'printer' when omitted entirely -- this keeps every
// pre-v2 caller (which never sent a `process` field) parsing exactly as
// before, while still requiring the discriminator once one of the new
// process variants is used.
const createCostingTemplateSchema = z.preprocess((value) => {
  if (value && typeof value === 'object' && !('process' in (value as Record<string, unknown>))) {
    return { ...(value as Record<string, unknown>), process: 'printer' };
  }
  return value;
}, z.discriminatedUnion('process', [printerVariantSchema, scannerVariantSchema, laserSheetVariantSchema, laserPremadeVariantSchema]));

type ResolvedLabourLine = { id: string; name: string; hourlyRate: number; hours: number };
type ResolvedConsumableLine = { id: string; name: string; costPerUnit: number; quantity: number };

// Shared by every process branch below -- batch-resolves labour steps and
// consumables in one round trip per type (instead of one findById per
// line), same as the original 'printer' branch always did.
async function resolveLines(
  scoped: ReturnType<typeof tenantScope>,
  labourLines: { labourStepId: string; hours: number }[],
  consumableLines: { consumableId: string; quantity: number }[],
): Promise<
  | { ok: true; labourLines: ResolvedLabourLine[]; consumableLines: ResolvedConsumableLine[] }
  | { ok: false; error: string }
> {
  const labourStepsById = new Map(
    (await scoped.labourSteps.findManyByIds([...new Set(labourLines.map((line) => line.labourStepId))])).map(
      (step) => [step.id, step],
    ),
  );
  const resolvedLabourLines: ResolvedLabourLine[] = [];
  for (const line of labourLines) {
    const step = labourStepsById.get(line.labourStepId);
    if (!step) {
      return { ok: false, error: 'One of the labour steps was not found.' };
    }
    resolvedLabourLines.push({ id: step.id, name: step.name, hourlyRate: step.hourlyRate, hours: line.hours });
  }

  const consumablesById = new Map(
    (await scoped.consumables.findManyByIds([...new Set(consumableLines.map((line) => line.consumableId))])).map(
      (consumable) => [consumable.id, consumable],
    ),
  );
  const resolvedConsumableLines: ResolvedConsumableLine[] = [];
  for (const line of consumableLines) {
    const consumable = consumablesById.get(line.consumableId);
    if (!consumable) {
      return { ok: false, error: 'One of the consumables was not found.' };
    }
    resolvedConsumableLines.push({
      id: consumable.id,
      name: consumable.name,
      costPerUnit: consumable.costPerUnit,
      quantity: line.quantity,
    });
  }

  return { ok: true, labourLines: resolvedLabourLines, consumableLines: resolvedConsumableLines };
}

costingTemplatesRouter.get('/api/costing-templates', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const costingTemplates = await scoped.costingTemplates.findMany();
  res.json({ ok: true, costingTemplates: costingTemplates.map(serializeCostingTemplate) });
});

costingTemplatesRouter.get('/api/costing-templates/:id', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const costingTemplate = await scoped.costingTemplates.findById(req.params.id);
  if (!costingTemplate) {
    return res.status(404).json({ ok: false, error: 'Costing template not found.' });
  }
  res.json({ ok: true, costingTemplate: serializeCostingTemplate(costingTemplate) });
});

costingTemplatesRouter.post('/api/costing-templates', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const parsed = createCostingTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: 'Name, a valid process, its required fields, and markup are required.',
    });
  }
  const data = parsed.data;
  const scoped = tenantScope(req.tenantId!);

  const resolvedLines = await resolveLines(scoped, data.labourLines, data.consumableLines);
  if (!resolvedLines.ok) {
    return res.status(400).json({ ok: false, error: resolvedLines.error });
  }
  const { labourLines: resolvedLabourLines, consumableLines: resolvedConsumableLines } = resolvedLines;
  const engineLabourLines = resolvedLabourLines.map((line) => ({ hourlyRate: line.hourlyRate, hours: line.hours }));
  const engineConsumableLines = resolvedConsumableLines.map((line) => ({
    costPerUnit: line.costPerUnit,
    quantity: line.quantity,
  }));
  const persistLabourLines = resolvedLabourLines.map((line, i) => ({
    labourStepId: line.id,
    labourStepSnapshotName: line.name,
    hours: line.hours,
    hourlyRate: line.hourlyRate,
    index: i,
  }));
  const persistConsumableLines = resolvedConsumableLines.map((line, i) => ({
    consumableId: line.id,
    consumableSnapshotName: line.name,
    quantity: line.quantity,
    costPerUnit: line.costPerUnit,
    index: i,
  }));

  if (data.process === 'printer') {
    const filament = await scoped.filaments.findById(data.filamentId);
    if (!filament) {
      return res.status(400).json({ ok: false, error: 'Filament not found.' });
    }

    const printer = await scoped.printers.findById(data.printerId);
    if (!printer) {
      return res.status(400).json({ ok: false, error: 'Printer not found.' });
    }
    if (
      printer.electricityRatePerKwh == null ||
      printer.expectedLifetimeHours == null ||
      printer.purchaseCost == null ||
      printer.powerDrawWatts == null
    ) {
      return res.status(400).json({
        ok: false,
        error:
          'This printer is missing an electricity rate, power draw, expected lifetime, or purchase cost — set these before costing a job on it.',
      });
    }
    const electricityRatePerKwh = printer.electricityRatePerKwh;
    const expectedLifetimeHours = printer.expectedLifetimeHours;
    const purchaseCost = printer.purchaseCost;
    const powerDrawWatts = printer.powerDrawWatts;

    let result;
    try {
      result = calculateCosting({
        filament: {
          weightGrams: data.weightGrams,
          costPerKg: filament.costPerKg,
          costPerSpool: filament.costPerSpool,
          spoolWeightGrams: filament.spoolWeightGrams,
        },
        printer: {
          printTimeHours: data.printTimeHours,
          powerDrawWatts,
          electricityRatePerKwh,
          purchaseCost,
          expectedLifetimeHours,
        },
        labourLines: engineLabourLines,
        consumableLines: engineConsumableLines,
        markupPercent: data.markupPercent,
      });
    } catch (err) {
      if (err instanceof CostingInputError) {
        return res.status(400).json({ ok: false, error: err.message });
      }
      throw err;
    }

    const costingTemplate = await scoped.costingTemplates.create({
      name: data.name,
      process: 'printer',
      filamentId: filament.id,
      filamentSnapshotBrand: filament.brand,
      filamentSnapshotMaterialType: filament.materialType,
      filamentSnapshotCostPerGram: result.costPerGram.toString(),
      weightGrams: data.weightGrams,
      printerId: printer.id,
      printerSnapshotName: printer.name,
      printerSnapshotElectricityRatePerKwh: electricityRatePerKwh.toString(),
      printerSnapshotDepreciationPerHour: result.depreciationPerHour.toString(),
      printerSnapshotPowerDrawWatts: powerDrawWatts,
      printTimeHours: data.printTimeHours,
      markupPercent: result.markupPercent.toString(),
      filamentCost: result.filamentCost.toString(),
      electricityCost: result.electricityCost.toString(),
      depreciationCost: result.depreciationCost.toString(),
      labourCost: result.labourCost.toString(),
      consumablesCost: result.consumablesCost.toString(),
      totalCost: result.totalCost.toString(),
      suggestedPrice: result.suggestedPrice.toString(),
      labourLines: persistLabourLines.map((line) => ({
        labourStepId: line.labourStepId,
        labourStepSnapshotName: line.labourStepSnapshotName,
        hourlyRateSnapshot: result.labourLineRates[line.index].toString(),
        hours: line.hours,
        lineCost: result.labourLineCosts[line.index].toString(),
      })),
      consumableLines: persistConsumableLines.map((line) => ({
        consumableId: line.consumableId,
        consumableSnapshotName: line.consumableSnapshotName,
        costPerUnitSnapshot: result.consumableLineRates[line.index].toString(),
        quantity: line.quantity,
        lineCost: result.consumableLineCosts[line.index].toString(),
      })),
    });

    return res.status(201).json({ ok: true, costingTemplate: serializeCostingTemplate(costingTemplate) });
  }

  if (data.process === 'scanner') {
    const scanner = await scoped.scanners.findById(data.scannerId);
    if (!scanner) {
      return res.status(400).json({ ok: false, error: 'Scanner not found.' });
    }

    let result;
    try {
      result = calculateScannerCosting({
        scannerCost: scanner.scannerCost,
        expectedScanHours: scanner.expectedScanHours,
        powerCostPerHour: scanner.powerCostPerHour,
        scanHours: data.scanHours,
        labourLines: engineLabourLines,
        consumableLines: engineConsumableLines,
        markupPercent: data.markupPercent,
      });
    } catch (err) {
      if (err instanceof CostingInputError) {
        return res.status(400).json({ ok: false, error: err.message });
      }
      throw err;
    }

    const costingTemplate = await scoped.costingTemplates.create({
      name: data.name,
      process: 'scanner',
      filamentId: null,
      filamentSnapshotBrand: null,
      filamentSnapshotMaterialType: null,
      filamentSnapshotCostPerGram: null,
      weightGrams: null,
      printerId: null,
      printerSnapshotName: null,
      printerSnapshotElectricityRatePerKwh: null,
      printerSnapshotDepreciationPerHour: null,
      printerSnapshotPowerDrawWatts: null,
      printTimeHours: null,
      scannerId: scanner.id,
      scannerSnapshotName: scanner.name,
      scanHours: data.scanHours,
      markupPercent: result.markupPercent.toString(),
      // Scanner has no separate material cost -- its single blended
      // hourly-rate cost (depreciation + power) is stored in
      // depreciationCost, the closest existing bucket, with filamentCost
      // and electricityCost left at zero. See calculate.ts's
      // calculateScannerCosting for the formula.
      filamentCost: '0.00',
      electricityCost: '0.00',
      depreciationCost: result.scanCost.toString(),
      labourCost: result.labourCost.toString(),
      consumablesCost: result.consumablesCost.toString(),
      totalCost: result.totalCost.toString(),
      suggestedPrice: result.suggestedPrice.toString(),
      labourLines: persistLabourLines.map((line) => ({
        labourStepId: line.labourStepId,
        labourStepSnapshotName: line.labourStepSnapshotName,
        hourlyRateSnapshot: result.labourLineRates[line.index].toString(),
        hours: line.hours,
        lineCost: result.labourLineCosts[line.index].toString(),
      })),
      consumableLines: persistConsumableLines.map((line) => ({
        consumableId: line.consumableId,
        consumableSnapshotName: line.consumableSnapshotName,
        costPerUnitSnapshot: result.consumableLineRates[line.index].toString(),
        quantity: line.quantity,
        lineCost: result.consumableLineCosts[line.index].toString(),
      })),
    });

    return res.status(201).json({ ok: true, costingTemplate: serializeCostingTemplate(costingTemplate) });
  }

  if (data.process === 'laser_sheet') {
    const laserMaterial = await scoped.laserMaterials.findById(data.laserMaterialId);
    if (!laserMaterial) {
      return res.status(400).json({ ok: false, error: 'Laser material not found.' });
    }

    let result;
    try {
      result = calculateLaserCosting({
        variant: 'sheet',
        sheetPrice: laserMaterial.sheetPrice,
        usableSheetAreaM2: laserMaterial.usableSheetAreaM2,
        costMultiplier: laserMaterial.costMultiplier,
        areaM2: data.sheetAreaUsedM2,
        labourLines: engineLabourLines,
        consumableLines: engineConsumableLines,
        markupPercent: data.markupPercent,
      });
    } catch (err) {
      if (err instanceof CostingInputError) {
        return res.status(400).json({ ok: false, error: err.message });
      }
      throw err;
    }

    const costingTemplate = await scoped.costingTemplates.create({
      name: data.name,
      process: 'laser_sheet',
      filamentId: null,
      filamentSnapshotBrand: null,
      filamentSnapshotMaterialType: null,
      filamentSnapshotCostPerGram: null,
      weightGrams: null,
      printerId: null,
      printerSnapshotName: null,
      printerSnapshotElectricityRatePerKwh: null,
      printerSnapshotDepreciationPerHour: null,
      printerSnapshotPowerDrawWatts: null,
      printTimeHours: null,
      laserMaterialId: laserMaterial.id,
      laserMaterialSnapshotName: laserMaterial.name,
      sheetAreaUsedM2: data.sheetAreaUsedM2,
      markupPercent: result.markupPercent.toString(),
      // The sheet material cost is stored in filamentCost, the closest
      // existing "material consumed" bucket, with electricityCost and
      // depreciationCost left at zero.
      filamentCost: result.materialCost.toString(),
      electricityCost: '0.00',
      depreciationCost: '0.00',
      labourCost: result.labourCost.toString(),
      consumablesCost: result.consumablesCost.toString(),
      totalCost: result.totalCost.toString(),
      suggestedPrice: result.suggestedPrice.toString(),
      labourLines: persistLabourLines.map((line) => ({
        labourStepId: line.labourStepId,
        labourStepSnapshotName: line.labourStepSnapshotName,
        hourlyRateSnapshot: result.labourLineRates[line.index].toString(),
        hours: line.hours,
        lineCost: result.labourLineCosts[line.index].toString(),
      })),
      consumableLines: persistConsumableLines.map((line) => ({
        consumableId: line.consumableId,
        consumableSnapshotName: line.consumableSnapshotName,
        costPerUnitSnapshot: result.consumableLineRates[line.index].toString(),
        quantity: line.quantity,
        lineCost: result.consumableLineCosts[line.index].toString(),
      })),
    });

    return res.status(201).json({ ok: true, costingTemplate: serializeCostingTemplate(costingTemplate) });
  }

  // data.process === 'laser_premade'
  const premadeItem = await scoped.premadeItems.findById(data.premadeItemId);
  if (!premadeItem) {
    return res.status(400).json({ ok: false, error: 'Premade item not found.' });
  }

  let result;
  try {
    result = calculateLaserCosting({
      variant: 'premade',
      unitCost: premadeItem.unitCost,
      costMultiplier: premadeItem.costMultiplier,
      quantity: data.premadeItemQuantity,
      labourLines: engineLabourLines,
      consumableLines: engineConsumableLines,
      markupPercent: data.markupPercent,
    });
  } catch (err) {
    if (err instanceof CostingInputError) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    throw err;
  }

  const costingTemplate = await scoped.costingTemplates.create({
    name: data.name,
    process: 'laser_premade',
    filamentId: null,
    filamentSnapshotBrand: null,
    filamentSnapshotMaterialType: null,
    filamentSnapshotCostPerGram: null,
    weightGrams: null,
    printerId: null,
    printerSnapshotName: null,
    printerSnapshotElectricityRatePerKwh: null,
    printerSnapshotDepreciationPerHour: null,
    printerSnapshotPowerDrawWatts: null,
    printTimeHours: null,
    premadeItemId: premadeItem.id,
    premadeItemSnapshotName: premadeItem.name,
    premadeItemQuantity: data.premadeItemQuantity,
    markupPercent: result.markupPercent.toString(),
    // Same reuse-of-filamentCost convention as the laser_sheet branch above.
    filamentCost: result.materialCost.toString(),
    electricityCost: '0.00',
    depreciationCost: '0.00',
    labourCost: result.labourCost.toString(),
    consumablesCost: result.consumablesCost.toString(),
    totalCost: result.totalCost.toString(),
    suggestedPrice: result.suggestedPrice.toString(),
    labourLines: persistLabourLines.map((line) => ({
      labourStepId: line.labourStepId,
      labourStepSnapshotName: line.labourStepSnapshotName,
      hourlyRateSnapshot: result.labourLineRates[line.index].toString(),
      hours: line.hours,
      lineCost: result.labourLineCosts[line.index].toString(),
    })),
    consumableLines: persistConsumableLines.map((line) => ({
      consumableId: line.consumableId,
      consumableSnapshotName: line.consumableSnapshotName,
      costPerUnitSnapshot: result.consumableLineRates[line.index].toString(),
      quantity: line.quantity,
      lineCost: result.consumableLineCosts[line.index].toString(),
    })),
  });

  res.status(201).json({ ok: true, costingTemplate: serializeCostingTemplate(costingTemplate) });
});
