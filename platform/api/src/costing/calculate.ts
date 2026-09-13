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

// --- Scanner / laser costing (Costing Calculator v2) ---
//
// Both calculateScannerCosting and calculateLaserCosting below share the
// exact same "labour + consumables + markup" tail as calculateCosting()
// above -- factored out here into one internal helper so that tail's
// rounding rules (round each line first, THEN sum; round markupPercent
// first, THEN apply it) live in exactly one place for these two new
// functions, rather than being duplicated inline twice. calculateCosting()
// itself is left completely untouched (same inline tail it always had) so
// its behavior/signature stay byte-identical, per the design spec.

export interface CostingTail {
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

function calculateLabourConsumablesMarkupTail(
  baseCost: Prisma.Decimal,
  labourLines: LabourLineInput[],
  consumableLines: ConsumableLineInput[],
  markupPercent: number,
): CostingTail {
  const roundedMarkupPercent = round(toDecimal(markupPercent), 2);

  const labourLineRates = labourLines.map((line) => round(toDecimal(line.hourlyRate), 2));
  const labourLineCosts = labourLines.map((line, i) => round(labourLineRates[i].times(line.hours), 2));
  const labourCost = labourLineCosts.reduce((sum, cost) => sum.plus(cost), new Prisma.Decimal(0));

  const consumableLineRates = consumableLines.map((line) => round(toDecimal(line.costPerUnit), 2));
  const consumableLineCosts = consumableLines.map((line, i) => round(consumableLineRates[i].times(line.quantity), 2));
  const consumablesCost = consumableLineCosts.reduce((sum, cost) => sum.plus(cost), new Prisma.Decimal(0));

  const totalCost = round(baseCost.plus(labourCost).plus(consumablesCost), 2);

  const suggestedPrice = round(
    totalCost.times(new Prisma.Decimal(1).plus(roundedMarkupPercent.dividedBy(100))),
    2,
  );

  return {
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

export interface ScannerCostingInput {
  scannerCost: number;
  expectedScanHours: number;
  powerCostPerHour: number;
  scanHours: number;
  labourLines: LabourLineInput[];
  consumableLines: ConsumableLineInput[];
  markupPercent: number;
}

export interface ScannerCostingResult extends CostingTail {
  hourlyRate: Prisma.Decimal;
  scanCost: Prisma.Decimal;
}

// Reference product's own stated formula: "scanner cost ÷ expected scan
// hours + power/hr". Implemented precisely as stated, not rederived.
export function calculateScannerCosting(input: ScannerCostingInput): ScannerCostingResult {
  const { scannerCost, expectedScanHours, powerCostPerHour, scanHours, labourLines, consumableLines, markupPercent } =
    input;

  if (!(expectedScanHours > 0)) {
    throw new CostingInputError('Scanner is missing a valid expected scan hours for depreciation.');
  }

  const hourlyRate = round(
    toDecimal(scannerCost).dividedBy(expectedScanHours).plus(toDecimal(powerCostPerHour)),
    4,
  );
  const scanCost = round(hourlyRate.times(scanHours), 2);

  const tail = calculateLabourConsumablesMarkupTail(scanCost, labourLines, consumableLines, markupPercent);

  return { hourlyRate, scanCost, ...tail };
}

export type LaserCostingInput =
  | {
      variant: 'sheet';
      sheetPrice: number;
      usableSheetAreaM2: number;
      costMultiplier: number;
      areaM2: number;
      labourLines: LabourLineInput[];
      consumableLines: ConsumableLineInput[];
      markupPercent: number;
    }
  | {
      variant: 'premade';
      unitCost: number;
      costMultiplier: number;
      quantity: number;
      labourLines: LabourLineInput[];
      consumableLines: ConsumableLineInput[];
      markupPercent: number;
    };

export interface LaserCostingResult extends CostingTail {
  materialCost: Prisma.Decimal;
}

export function calculateLaserCosting(input: LaserCostingInput): LaserCostingResult {
  let materialCost: Prisma.Decimal;

  if (input.variant === 'sheet') {
    if (!(input.usableSheetAreaM2 > 0)) {
      throw new CostingInputError('Laser material is missing a valid usable sheet area.');
    }
    // Reference product's own stated formula: "part m² × (sheet price ÷
    // usable sheet m²) × multiplier". Implemented precisely as stated
    // (single round at the end), not rederived.
    materialCost = round(
      toDecimal(input.areaM2).dividedBy(input.usableSheetAreaM2).times(input.sheetPrice).times(input.costMultiplier),
      2,
    );
  } else {
    materialCost = round(toDecimal(input.unitCost).times(input.costMultiplier).times(input.quantity), 2);
  }

  const tail = calculateLabourConsumablesMarkupTail(
    materialCost,
    input.labourLines,
    input.consumableLines,
    input.markupPercent,
  );

  return { materialCost, ...tail };
}
