import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCosting, CostingInputError } from '../src/costing/calculate.js';

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
