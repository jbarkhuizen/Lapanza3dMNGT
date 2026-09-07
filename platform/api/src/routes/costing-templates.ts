import { Router } from 'express';
import { z } from 'zod';
import type { CostingTemplate, CostingLabourLine, CostingConsumableLine } from '@prisma/client';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { tenantScope } from '../db/scoped.js';
import { calculateCosting, CostingInputError } from '../costing/calculate.js';

export const costingTemplatesRouter = Router();
costingTemplatesRouter.use(requireTenantAuth);

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

const createCostingTemplateSchema = z.object({
  name: z.string().min(1),
  filamentId: z.string().min(1),
  weightGrams: z.number().positive(),
  printerId: z.string().min(1),
  printTimeHours: z.number().positive(),
  markupPercent: z.number().min(0),
  labourLines: z.array(labourLineSchema).default([]),
  consumableLines: z.array(consumableLineSchema).default([]),
});

costingTemplatesRouter.get('/api/costing-templates', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const costingTemplates = await scoped.costingTemplates.findMany();
  res.json({ ok: true, costingTemplates: costingTemplates.map(serializeCostingTemplate) });
});

costingTemplatesRouter.get('/api/costing-templates/:id', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const costingTemplate = await scoped.costingTemplates.findById(req.params.id);
  if (!costingTemplate) {
    return res.status(404).json({ ok: false, error: 'Costing template not found.' });
  }
  res.json({ ok: true, costingTemplate: serializeCostingTemplate(costingTemplate) });
});

costingTemplatesRouter.post('/api/costing-templates', async (req, res) => {
  const parsed = createCostingTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: 'Name, filament, weight, printer, print time, and markup are required.',
    });
  }
  const { name, filamentId, weightGrams, printerId, printTimeHours, markupPercent, labourLines, consumableLines } =
    parsed.data;
  const scoped = tenantScope(req.tenantId!);

  const filament = await scoped.filaments.findById(filamentId);
  if (!filament) {
    return res.status(400).json({ ok: false, error: 'Filament not found.' });
  }

  const printer = await scoped.printers.findById(printerId);
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

  const resolvedLabourLines: Array<{ id: string; name: string; hourlyRate: number; hours: number }> = [];
  for (const line of labourLines) {
    const step = await scoped.labourSteps.findById(line.labourStepId);
    if (!step) {
      return res.status(400).json({ ok: false, error: 'One of the labour steps was not found.' });
    }
    resolvedLabourLines.push({ id: step.id, name: step.name, hourlyRate: step.hourlyRate, hours: line.hours });
  }

  const resolvedConsumableLines: Array<{ id: string; name: string; costPerUnit: number; quantity: number }> = [];
  for (const line of consumableLines) {
    const consumable = await scoped.consumables.findById(line.consumableId);
    if (!consumable) {
      return res.status(400).json({ ok: false, error: 'One of the consumables was not found.' });
    }
    resolvedConsumableLines.push({
      id: consumable.id,
      name: consumable.name,
      costPerUnit: consumable.costPerUnit,
      quantity: line.quantity,
    });
  }

  let result;
  try {
    result = calculateCosting({
      filament: {
        weightGrams,
        costPerKg: filament.costPerKg,
        costPerSpool: filament.costPerSpool,
        spoolWeightGrams: filament.spoolWeightGrams,
      },
      printer: {
        printTimeHours,
        powerDrawWatts,
        electricityRatePerKwh,
        purchaseCost,
        expectedLifetimeHours,
      },
      labourLines: resolvedLabourLines.map((line) => ({ hourlyRate: line.hourlyRate, hours: line.hours })),
      consumableLines: resolvedConsumableLines.map((line) => ({
        costPerUnit: line.costPerUnit,
        quantity: line.quantity,
      })),
      markupPercent,
    });
  } catch (err) {
    if (err instanceof CostingInputError) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    throw err;
  }

  const costingTemplate = await scoped.costingTemplates.create({
    name,
    filamentId: filament.id,
    filamentSnapshotBrand: filament.brand,
    filamentSnapshotMaterialType: filament.materialType,
    filamentSnapshotCostPerGram: result.costPerGram.toString(),
    weightGrams,
    printerId: printer.id,
    printerSnapshotName: printer.name,
    printerSnapshotElectricityRatePerKwh: electricityRatePerKwh.toString(),
    printerSnapshotDepreciationPerHour: result.depreciationPerHour.toString(),
    printTimeHours,
    markupPercent: markupPercent.toString(),
    filamentCost: result.filamentCost.toString(),
    electricityCost: result.electricityCost.toString(),
    depreciationCost: result.depreciationCost.toString(),
    labourCost: result.labourCost.toString(),
    consumablesCost: result.consumablesCost.toString(),
    totalCost: result.totalCost.toString(),
    suggestedPrice: result.suggestedPrice.toString(),
    labourLines: resolvedLabourLines.map((line, i) => ({
      labourStepId: line.id,
      labourStepSnapshotName: line.name,
      hourlyRateSnapshot: line.hourlyRate.toString(),
      hours: line.hours,
      lineCost: result.labourLineCosts[i].toString(),
    })),
    consumableLines: resolvedConsumableLines.map((line, i) => ({
      consumableId: line.id,
      consumableSnapshotName: line.name,
      costPerUnitSnapshot: line.costPerUnit.toString(),
      quantity: line.quantity,
      lineCost: result.consumableLineCosts[i].toString(),
    })),
  });

  res.status(201).json({ ok: true, costingTemplate: serializeCostingTemplate(costingTemplate) });
});
