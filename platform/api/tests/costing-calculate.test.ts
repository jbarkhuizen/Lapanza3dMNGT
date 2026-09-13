import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCosting, calculateScannerCosting, calculateLaserCosting, CostingInputError } from '../src/costing/calculate.js';

const baseFilament = { weightGrams: 0, costPerKg: 0, costPerSpool: null, spoolWeightGrams: null };
const basePrinter = { printTimeHours: 0, powerDrawWatts: 0, electricityRatePerKwh: 0, purchaseCost: 0, expectedLifetimeHours: 1000 };

test('computes filament cost from costPerKg', () => {
  const result = calculateCosting({
    filament: { weightGrams: 50, costPerKg: 300, costPerSpool: null, spoolWeightGrams: null },
    printer: basePrinter,
    labourLines: [],
    consumableLines: [],
    markupPercent: 0,
  });
  assert.equal(result.filamentCost.toFixed(2), '15.00');
});

test('falls back to costPerSpool / spoolWeightGrams when costPerKg is not set', () => {
  const result = calculateCosting({
    filament: { weightGrams: 100, costPerKg: null, costPerSpool: 350, spoolWeightGrams: 1000 },
    printer: basePrinter,
    labourLines: [],
    consumableLines: [],
    markupPercent: 0,
  });
  assert.equal(result.filamentCost.toFixed(2), '35.00');
  assert.equal(result.costPerGram.toFixed(4), '0.3500');
});

test('throws CostingInputError when filament has no cost data', () => {
  assert.throws(
    () =>
      calculateCosting({
        filament: { weightGrams: 50, costPerKg: null, costPerSpool: null, spoolWeightGrams: null },
        printer: basePrinter,
        labourLines: [],
        consumableLines: [],
        markupPercent: 0,
      }),
    CostingInputError,
  );
});

test('computes electricity cost from print time, wattage, and rate', () => {
  const result = calculateCosting({
    filament: baseFilament,
    printer: { printTimeHours: 4, powerDrawWatts: 250, electricityRatePerKwh: 3, purchaseCost: 0, expectedLifetimeHours: 1000 },
    labourLines: [],
    consumableLines: [],
    markupPercent: 0,
  });
  assert.equal(result.electricityCost.toFixed(2), '3.00');
});

test('computes straight-line depreciation cost', () => {
  const result = calculateCosting({
    filament: baseFilament,
    printer: { printTimeHours: 5, powerDrawWatts: 0, electricityRatePerKwh: 0, purchaseCost: 4000, expectedLifetimeHours: 2000 },
    labourLines: [],
    consumableLines: [],
    markupPercent: 0,
  });
  assert.equal(result.depreciationPerHour.toFixed(2), '2.00');
  assert.equal(result.depreciationCost.toFixed(2), '10.00');
});

test('throws CostingInputError when expectedLifetimeHours is zero', () => {
  assert.throws(
    () =>
      calculateCosting({
        filament: baseFilament,
        printer: { printTimeHours: 5, powerDrawWatts: 0, electricityRatePerKwh: 0, purchaseCost: 4000, expectedLifetimeHours: 0 },
        labourLines: [],
        consumableLines: [],
        markupPercent: 0,
      }),
    CostingInputError,
  );
});

test('sums multiple labour lines and reports per-line costs', () => {
  const result = calculateCosting({
    filament: baseFilament,
    printer: basePrinter,
    labourLines: [
      { hourlyRate: 150, hours: 1 },
      { hourlyRate: 100, hours: 2 },
    ],
    consumableLines: [],
    markupPercent: 0,
  });
  assert.equal(result.labourCost.toFixed(2), '350.00');
  assert.equal(result.labourLineCosts[0].toFixed(2), '150.00');
  assert.equal(result.labourLineCosts[1].toFixed(2), '200.00');
});

test('sums multiple consumable lines and reports per-line costs', () => {
  const result = calculateCosting({
    filament: baseFilament,
    printer: basePrinter,
    labourLines: [],
    consumableLines: [
      { costPerUnit: 5, quantity: 3 },
      { costPerUnit: 2.5, quantity: 4 },
    ],
    markupPercent: 0,
  });
  assert.equal(result.consumablesCost.toFixed(2), '25.00');
  assert.equal(result.consumableLineCosts[0].toFixed(2), '15.00');
  assert.equal(result.consumableLineCosts[1].toFixed(2), '10.00');
});

test('total cost sums all five components, and suggested price applies markup', () => {
  const result = calculateCosting({
    filament: { weightGrams: 50, costPerKg: 300, costPerSpool: null, spoolWeightGrams: null }, // 15.00
    printer: { printTimeHours: 2, powerDrawWatts: 200, electricityRatePerKwh: 2.5, purchaseCost: 4000, expectedLifetimeHours: 2000 },
    // electricity: 2h * 0.2kW * 2.5 = 1.00; depreciation: 2h * (4000/2000) = 4.00
    labourLines: [{ hourlyRate: 150, hours: 1 }], // 150.00
    consumableLines: [{ costPerUnit: 10, quantity: 2 }], // 20.00
    markupPercent: 50,
  });
  assert.equal(result.totalCost.toFixed(2), '190.00');
  assert.equal(result.suggestedPrice.toFixed(2), '285.00');
});

test('accepts a Prisma.Decimal instance for electricityRatePerKwh, as a resolved printer record would provide', async () => {
  const { Prisma } = await import('@prisma/client');
  const result = calculateCosting({
    filament: baseFilament,
    printer: {
      printTimeHours: 2,
      powerDrawWatts: 500,
      electricityRatePerKwh: new Prisma.Decimal('2.5000'),
      purchaseCost: 0,
      expectedLifetimeHours: 1000,
    },
    labourLines: [],
    consumableLines: [],
    markupPercent: 0,
  });
  // 2h * 0.5kW * 2.5 = 2.50
  assert.equal(result.electricityCost.toFixed(2), '2.50');
});

test('zero markup leaves suggested price equal to total cost', () => {
  const result = calculateCosting({
    filament: { weightGrams: 10, costPerKg: 100, costPerSpool: null, spoolWeightGrams: null },
    printer: basePrinter,
    labourLines: [],
    consumableLines: [],
    markupPercent: 0,
  });
  assert.equal(result.suggestedPrice.toFixed(2), result.totalCost.toFixed(2));
});

test('the five cost components sum exactly to totalCost, even with fractional inputs that would otherwise drift', () => {
  const result = calculateCosting({
    filament: { weightGrams: 128, costPerKg: null, costPerSpool: 425.5, spoolWeightGrams: 750 },
    printer: { printTimeHours: 7.25, powerDrawWatts: 340, electricityRatePerKwh: 3.175, purchaseCost: 18500, expectedLifetimeHours: 7500 },
    labourLines: [{ hourlyRate: 45.33, hours: 2.5 }, { hourlyRate: 60, hours: 1.1 }],
    consumableLines: [{ costPerUnit: 7.25, quantity: 3 }, { costPerUnit: 2.1, quantity: 4 }],
    markupPercent: 27.5,
  });
  const componentSum = result.filamentCost
    .plus(result.electricityCost)
    .plus(result.depreciationCost)
    .plus(result.labourCost)
    .plus(result.consumablesCost);
  assert.equal(componentSum.toFixed(2), result.totalCost.toFixed(2));
});

test('rounds each labour/consumable line to exact cents before summing, using round-half-up', () => {
  const result = calculateCosting({
    filament: baseFilament,
    printer: basePrinter,
    labourLines: [{ hourlyRate: 62.5, hours: 0.85 }], // 53.125 -> 53.13 under HALF_UP (53.12 under HALF_EVEN)
    // the rate is rounded to 2dp FIRST (2.335 -> 2.34 under HALF_UP), THEN multiplied:
    // 2.34 * 3 = 7.02 exactly. (Rounding the raw 2.335 * 3 = 7.005 total directly, without
    // rounding the rate first, would give 7.01 -- that's the old, now-fixed defect.)
    consumableLines: [{ costPerUnit: 2.335, quantity: 3 }],
    markupPercent: 0,
  });
  assert.equal(result.labourLineCosts[0].toFixed(2), '53.13');
  assert.equal(result.consumableLineCosts[0].toFixed(2), '7.02');
});

test('suggestedPrice rounds markupPercent BEFORE applying it to totalCost, not after', () => {
  // totalCost is a clean 200.00 (one labour line, everything else zeroed out),
  // so suggestedPrice = totalCost * (1 + markup/100) is exact once markup is fixed --
  // isolating which markup value (rounded-first vs raw) actually gets used.
  //
  // markupPercent = 9.335 sits exactly halfway between two cents once doubled:
  //   - round markup FIRST (implemented, correct): round(9.335, 2) = 9.34,
  //     then 200 * 1.0934 = 218.68 exactly.
  //   - apply raw markup FIRST, round only the final price (the old, fixed
  //     defect): 200 * 1.09335 = 218.67 exactly.
  // The two orderings genuinely diverge by a full cent (218.68 vs 218.67) --
  // this pins the correct (already-implemented) ordering.
  const result = calculateCosting({
    filament: baseFilament,
    printer: basePrinter,
    labourLines: [{ hourlyRate: 200, hours: 1 }],
    consumableLines: [],
    markupPercent: 9.335,
  });
  assert.equal(result.totalCost.toFixed(2), '200.00');
  assert.equal(result.markupPercent.toFixed(2), '9.34');
  assert.equal(result.suggestedPrice.toFixed(2), '218.68');
});

test('rounds markupPercent, hourlyRate, and costPerUnit snapshots to 2dp and returns them for persistence', () => {
  const result = calculateCosting({
    filament: baseFilament,
    printer: basePrinter,
    labourLines: [{ hourlyRate: 45.335, hours: 2 }],
    consumableLines: [{ costPerUnit: 0.125, quantity: 7 }],
    markupPercent: 12.345,
  });
  assert.equal(result.markupPercent.toFixed(2), '12.35');
  assert.equal(result.labourLineRates[0].toFixed(2), '45.34');
  assert.equal(result.consumableLineRates[0].toFixed(2), '0.13');
  // the whole point: re-multiplying the PERSISTED rate by the PERSISTED quantity
  // must reproduce the PERSISTED line cost exactly -- this is what was broken
  assert.equal(
    result.labourLineRates[0].times(2).toFixed(2),
    result.labourLineCosts[0].toFixed(2),
  );
  assert.equal(
    result.consumableLineRates[0].times(7).toFixed(2),
    result.consumableLineCosts[0].toFixed(2),
  );
});

// --- calculateScannerCosting ---

test('calculateScannerCosting: hourlyRate = scannerCost / expectedScanHours + powerCostPerHour', () => {
  const result = calculateScannerCosting({
    scannerCost: 6000,
    expectedScanHours: 1000,
    powerCostPerHour: 0.5,
    scanHours: 2,
    labourLines: [],
    consumableLines: [],
    markupPercent: 0,
  });
  // 6000 / 1000 = 6.00, + 0.5 = 6.5000
  assert.equal(result.hourlyRate.toFixed(4), '6.5000');
  // 6.5 * 2 = 13.00
  assert.equal(result.scanCost.toFixed(2), '13.00');
  assert.equal(result.totalCost.toFixed(2), '13.00');
});

test('calculateScannerCosting: combines scan cost with labour/consumables/markup using the shared tail', () => {
  const result = calculateScannerCosting({
    scannerCost: 0,
    expectedScanHours: 100,
    powerCostPerHour: 0,
    scanHours: 1,
    labourLines: [{ hourlyRate: 150, hours: 1 }],
    consumableLines: [{ costPerUnit: 10, quantity: 2 }],
    markupPercent: 50,
  });
  assert.equal(result.scanCost.toFixed(2), '0.00');
  assert.equal(result.labourCost.toFixed(2), '150.00');
  assert.equal(result.consumablesCost.toFixed(2), '20.00');
  assert.equal(result.totalCost.toFixed(2), '170.00');
  assert.equal(result.suggestedPrice.toFixed(2), '255.00');
});

test('calculateScannerCosting throws CostingInputError when expectedScanHours is zero', () => {
  assert.throws(
    () =>
      calculateScannerCosting({
        scannerCost: 6000,
        expectedScanHours: 0,
        powerCostPerHour: 0,
        scanHours: 2,
        labourLines: [],
        consumableLines: [],
        markupPercent: 0,
      }),
    CostingInputError,
  );
});

test('calculateScannerCosting rounds hourlyRate to 4dp BEFORE multiplying by scanHours, not after', () => {
  // 1/7 = 0.142857142857... -> round to 4dp = 0.1429 (5th decimal digit is 5, rounds up).
  // Rounding-first: 0.1429 * 700 = 100.03.
  // Raw (unrounded) multiplication would give exactly 100.00 (1/7 * 700 = 100), rounded
  // to 2dp as 100.00 -- a full 3-cent divergence from the rounded-first result, so this
  // pins which ordering is actually implemented.
  const result = calculateScannerCosting({
    scannerCost: 1,
    expectedScanHours: 7,
    powerCostPerHour: 0,
    scanHours: 700,
    labourLines: [],
    consumableLines: [],
    markupPercent: 0,
  });
  assert.equal(result.hourlyRate.toFixed(4), '0.1429');
  assert.equal(result.scanCost.toFixed(2), '100.03');
});

// --- calculateLaserCosting (sheet variant) ---

test('calculateLaserCosting (sheet): perPartCost = (areaM2 / usableSheetAreaM2) * sheetPrice * costMultiplier', () => {
  const result = calculateLaserCosting({
    variant: 'sheet',
    sheetPrice: 500,
    usableSheetAreaM2: 2,
    costMultiplier: 1,
    areaM2: 0.5,
    labourLines: [],
    consumableLines: [],
    markupPercent: 0,
  });
  // (0.5 / 2) * 500 * 1 = 125.00
  assert.equal(result.materialCost.toFixed(2), '125.00');
  assert.equal(result.totalCost.toFixed(2), '125.00');
});

test('calculateLaserCosting (sheet): applies costMultiplier and combines with labour/consumables/markup', () => {
  const result = calculateLaserCosting({
    variant: 'sheet',
    sheetPrice: 500,
    usableSheetAreaM2: 2,
    costMultiplier: 1.2,
    areaM2: 0.5,
    labourLines: [{ hourlyRate: 100, hours: 1 }],
    consumableLines: [],
    markupPercent: 10,
  });
  // (0.5 / 2) * 500 * 1.2 = 150.00
  assert.equal(result.materialCost.toFixed(2), '150.00');
  assert.equal(result.totalCost.toFixed(2), '250.00');
  assert.equal(result.suggestedPrice.toFixed(2), '275.00');
});

test('calculateLaserCosting (sheet) throws CostingInputError when usableSheetAreaM2 is zero', () => {
  assert.throws(
    () =>
      calculateLaserCosting({
        variant: 'sheet',
        sheetPrice: 500,
        usableSheetAreaM2: 0,
        costMultiplier: 1,
        areaM2: 0.5,
        labourLines: [],
        consumableLines: [],
        markupPercent: 0,
      }),
    CostingInputError,
  );
});

test('calculateLaserCosting (sheet) rounds the division/multiplication chain only ONCE, at the end', () => {
  // 1 / 3 = 0.333333... -- if an implementation rounded this intermediate division to
  // e.g. 4dp (0.3333) before multiplying by sheetPrice, it would give 0.3333 * 300 =
  // 99.99. The spec's formula has no intermediate rounding: (1/3) * 300 = exactly
  // 100, rounded once to 100.00 -- a 1-cent divergence that pins the correct ordering.
  const result = calculateLaserCosting({
    variant: 'sheet',
    sheetPrice: 300,
    usableSheetAreaM2: 3,
    costMultiplier: 1,
    areaM2: 1,
    labourLines: [],
    consumableLines: [],
    markupPercent: 0,
  });
  assert.equal(result.materialCost.toFixed(2), '100.00');
});

// --- calculateLaserCosting (premade-item variant) ---

test('calculateLaserCosting (premade): itemCost = unitCost * costMultiplier * quantity', () => {
  const result = calculateLaserCosting({
    variant: 'premade',
    unitCost: 25,
    costMultiplier: 1,
    quantity: 3,
    labourLines: [],
    consumableLines: [],
    markupPercent: 0,
  });
  assert.equal(result.materialCost.toFixed(2), '75.00');
  assert.equal(result.totalCost.toFixed(2), '75.00');
});

test('calculateLaserCosting (premade): applies costMultiplier and combines with labour/consumables/markup', () => {
  const result = calculateLaserCosting({
    variant: 'premade',
    unitCost: 25,
    costMultiplier: 1.5,
    quantity: 2,
    labourLines: [{ hourlyRate: 50, hours: 2 }],
    consumableLines: [{ costPerUnit: 5, quantity: 1 }],
    markupPercent: 20,
  });
  // 25 * 1.5 * 2 = 75.00
  assert.equal(result.materialCost.toFixed(2), '75.00');
  // labour 100 + consumables 5 + material 75 = 180.00
  assert.equal(result.totalCost.toFixed(2), '180.00');
  assert.equal(result.suggestedPrice.toFixed(2), '216.00');
});

test('calculateLaserCosting (premade) rounds unitCost * costMultiplier * quantity only ONCE, at the end', () => {
  // 2.335 * 1 * 3 = 7.005 exactly -> round HALF_UP to 2dp = 7.01. A "round unitCost to
  // 2dp first" implementation would give 2.34 * 3 = 7.02 instead -- this pins the
  // single-round-at-the-end formula the spec states, matching the same rigor as the
  // existing labour/consumable line-rounding test above.
  const result = calculateLaserCosting({
    variant: 'premade',
    unitCost: 2.335,
    costMultiplier: 1,
    quantity: 3,
    labourLines: [],
    consumableLines: [],
    markupPercent: 0,
  });
  assert.equal(result.materialCost.toFixed(2), '7.01');
});
