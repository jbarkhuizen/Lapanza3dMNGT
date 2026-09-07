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
  markupPercent: Prisma.Decimal;
  labourLineCosts: Prisma.Decimal[];
  consumableLineCosts: Prisma.Decimal[];
  labourLineRates: Prisma.Decimal[];
  consumableLineRates: Prisma.Decimal[];
}

export class CostingInputError extends Error {}

function toDecimal(value: number | Prisma.Decimal): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

function round(value: Prisma.Decimal, decimalPlaces: number): Prisma.Decimal {
  return value.toDecimalPlaces(decimalPlaces, Prisma.Decimal.ROUND_HALF_UP);
}

export function calculateCosting(input: CostingInput): CostingResult {
  const { filament, printer, labourLines, consumableLines, markupPercent } = input;

  const roundedMarkupPercent = round(toDecimal(markupPercent), 2);

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
  costPerGram = round(costPerGram, 6);
  const filamentCost = round(costPerGram.times(filament.weightGrams), 2);

  const electricityCost = round(
    toDecimal(printer.printTimeHours)
      .times(toDecimal(printer.powerDrawWatts).dividedBy(1000))
      .times(toDecimal(printer.electricityRatePerKwh)),
    2,
  );

  if (!(printer.expectedLifetimeHours > 0)) {
    throw new CostingInputError('Printer is missing a valid expected lifetime (hours) for depreciation.');
  }
  const depreciationPerHour = round(
    toDecimal(printer.purchaseCost).dividedBy(printer.expectedLifetimeHours),
    4,
  );
  const depreciationCost = round(toDecimal(printer.printTimeHours).times(depreciationPerHour), 2);

  const labourLineRates = labourLines.map((line) => round(toDecimal(line.hourlyRate), 2));
  const labourLineCosts = labourLines.map((line, i) => round(labourLineRates[i].times(line.hours), 2));
  const labourCost = labourLineCosts.reduce((sum, cost) => sum.plus(cost), new Prisma.Decimal(0));

  const consumableLineRates = consumableLines.map((line) => round(toDecimal(line.costPerUnit), 2));
  const consumableLineCosts = consumableLines.map((line, i) => round(consumableLineRates[i].times(line.quantity), 2));
  const consumablesCost = consumableLineCosts.reduce((sum, cost) => sum.plus(cost), new Prisma.Decimal(0));

  const totalCost = round(
    filamentCost.plus(electricityCost).plus(depreciationCost).plus(labourCost).plus(consumablesCost),
    2,
  );

  const suggestedPrice = round(
    totalCost.times(new Prisma.Decimal(1).plus(roundedMarkupPercent.dividedBy(100))),
    2,
  );

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
    markupPercent: roundedMarkupPercent,
    labourLineCosts,
    consumableLineCosts,
    labourLineRates,
    consumableLineRates,
  };
}
