import { Prisma } from '@prisma/client';

export interface FilamentCostInput {
  weightGrams: number;
  costPerKg: number | null;
  costPerSpool: number | null;
  spoolWeightGrams: number | null;
}

export interface PrinterCostInput {
  printTimeHours: number;
  powerDrawWatts: number;
  electricityRatePerKwh: Prisma.Decimal | number;
  purchaseCost: number;
  expectedLifetimeHours: number;
}

export interface LabourLineInput {
  hourlyRate: number;
  hours: number;
}

export interface ConsumableLineInput {
  costPerUnit: number;
  quantity: number;
}

export interface CostingInput {
  filament: FilamentCostInput;
  printer: PrinterCostInput;
  labourLines: LabourLineInput[];
  consumableLines: ConsumableLineInput[];
  markupPercent: number;
}

export interface CostingResult {
  costPerGram: Prisma.Decimal;
  depreciationPerHour: Prisma.Decimal;
  filamentCost: Prisma.Decimal;
  electricityCost: Prisma.Decimal;
  depreciationCost: Prisma.Decimal;
  labourCost: Prisma.Decimal;
  consumablesCost: Prisma.Decimal;
  totalCost: Prisma.Decimal;
  suggestedPrice: Prisma.Decimal;
  labourLineCosts: Prisma.Decimal[];
  consumableLineCosts: Prisma.Decimal[];
}

export class CostingInputError extends Error {}

function toDecimal(value: number | Prisma.Decimal): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function calculateCosting(input: CostingInput): CostingResult {
  const { filament, printer, labourLines, consumableLines, markupPercent } = input;

  let costPerGram: Prisma.Decimal;
  if (filament.costPerKg != null) {
    costPerGram = toDecimal(filament.costPerKg).dividedBy(1000);
  } else if (filament.costPerSpool != null && filament.spoolWeightGrams) {
    costPerGram = toDecimal(filament.costPerSpool).dividedBy(filament.spoolWeightGrams);
  } else {
    throw new CostingInputError(
      'Filament has no cost data — set a cost per kg, or a cost per spool and spool weight.',
    );
  }
  const filamentCost = costPerGram.times(filament.weightGrams);

  const electricityCost = toDecimal(printer.printTimeHours)
    .times(toDecimal(printer.powerDrawWatts).dividedBy(1000))
    .times(toDecimal(printer.electricityRatePerKwh));

  if (!(printer.expectedLifetimeHours > 0)) {
    throw new CostingInputError('Printer is missing a valid expected lifetime (hours) for depreciation.');
  }
  const depreciationPerHour = toDecimal(printer.purchaseCost).dividedBy(printer.expectedLifetimeHours);
  const depreciationCost = toDecimal(printer.printTimeHours).times(depreciationPerHour);

  const labourLineCosts = labourLines.map((line) => toDecimal(line.hourlyRate).times(line.hours));
  const labourCost = labourLineCosts.reduce((sum, cost) => sum.plus(cost), new Prisma.Decimal(0));

  const consumableLineCosts = consumableLines.map((line) => toDecimal(line.costPerUnit).times(line.quantity));
  const consumablesCost = consumableLineCosts.reduce((sum, cost) => sum.plus(cost), new Prisma.Decimal(0));

  const totalCost = filamentCost
    .plus(electricityCost)
    .plus(depreciationCost)
    .plus(labourCost)
    .plus(consumablesCost);

  const suggestedPrice = totalCost.times(new Prisma.Decimal(1).plus(toDecimal(markupPercent).dividedBy(100)));

  return {
    costPerGram,
    depreciationPerHour,
    filamentCost,
    electricityCost,
    depreciationCost,
    labourCost,
    consumablesCost,
    totalCost,
    suggestedPrice,
    labourLineCosts,
    consumableLineCosts,
  };
}
