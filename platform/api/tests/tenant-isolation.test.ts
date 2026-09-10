import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';
import { hashPassword } from '../src/auth/password.js';
import { tenantScope } from '../src/db/scoped.js';

beforeEach(resetTestDatabase);

async function makeTenant(email: string) {
  return prisma.tenant.create({
    data: {
      businessName: 'Test Co',
      contactName: 'Test Person',
      email,
      passwordHash: await hashPassword('irrelevant password value'),
    },
  });
}

test('a tenant cannot see another tenant\'s customers', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  await scopedA.customers.create({ name: 'Alice Customer', billingAddress: '1 Main Rd' });
  await scopedB.customers.create({ name: 'Bob Customer', billingAddress: '2 Side St' });

  const aList = await scopedA.customers.findMany();
  const bList = await scopedB.customers.findMany();

  assert.equal(aList.length, 1);
  assert.equal(aList[0].name, 'Alice Customer');
  assert.equal(bList.length, 1);
  assert.equal(bList[0].name, 'Bob Customer');
});

test('findById returns null for a customer belonging to a different tenant', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  const created = await scopedA.customers.create({ name: 'Alice Customer', billingAddress: '1 Main Rd' });

  const foundByOwner = await scopedA.customers.findById(created.id);
  const foundByOther = await scopedB.customers.findById(created.id);

  assert.ok(foundByOwner);
  assert.equal(foundByOther, null);
});

test('update only affects the owning tenant\'s row', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  const created = await scopedA.customers.create({ name: 'Alice Customer', billingAddress: '1 Main Rd' });

  const otherTenantResult = await scopedB.customers.update(created.id, { notes: 'hijacked' });
  assert.equal(otherTenantResult, null);

  const ownerResult = await scopedA.customers.update(created.id, { notes: 'legit update' });
  assert.ok(ownerResult);
  assert.equal(ownerResult.notes, 'legit update');
});

test('tenantScope throws when given a falsy tenantId', () => {
  assert.throws(() => tenantScope(''), /tenantScope requires a tenantId/);
  // tenantScope's signature requires a string precisely so real callers
  // can't pass undefined — this test exists to prove the runtime guard
  // still catches it if a caller bypasses that (e.g. an untyped/JS caller,
  // or a value that only looks like a string until runtime). `any` is the
  // only way to construct that call past the type system on purpose.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assert.throws(() => tenantScope(undefined as any), /tenantScope requires a tenantId/);
});

test('update cannot reassign a row to a different tenant via a smuggled tenantId', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const scopedA = tenantScope(tenantA.id);
  const created = await scopedA.customers.create({ name: 'Alice Customer', billingAddress: '1 Main Rd' });

  // The update type deliberately excludes tenantId so it can't be
  // reassigned through the app's normal, typed call sites. This test
  // proves the DB layer itself also ignores a smuggled tenantId at
  // runtime (defense in depth) — which requires constructing a payload
  // the type system would otherwise refuse to let this call accept.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await scopedA.customers.update(created.id, { tenantId: tenantB.id, notes: 'attempted takeover' } as any);

  const stillOwnedByA = await scopedA.customers.findById(created.id);
  assert.ok(stillOwnedByA, 'row should still belong to tenant A');
  assert.equal(stillOwnedByA?.notes, 'attempted takeover', 'the legitimate field should still update');
});

test('a tenant cannot see another tenant\'s printers', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  await scopedA.printers.create({ name: 'Printer A' });
  await scopedB.printers.create({ name: 'Printer B' });

  const aList = await scopedA.printers.findMany();
  const bList = await scopedB.printers.findMany();

  assert.equal(aList.length, 1);
  assert.equal(aList[0].name, 'Printer A');
  assert.equal(bList.length, 1);
  assert.equal(bList[0].name, 'Printer B');
});

test('findById returns null for a printer belonging to a different tenant', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  const created = await scopedA.printers.create({ name: 'Printer A' });

  const foundByOwner = await scopedA.printers.findById(created.id);
  const foundByOther = await scopedB.printers.findById(created.id);

  assert.ok(foundByOwner);
  assert.equal(foundByOther, null);
});

test('printers update cannot reassign a row to a different tenant via a smuggled tenantId', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const scopedA = tenantScope(tenantA.id);
  const created = await scopedA.printers.create({ name: 'Printer A' });

  // Same smuggled-tenantId defense-in-depth check as the customers case
  // above — the update type has no tenantId field, so bypassing the type
  // system with `any` is the only way to build a payload that attempts it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await scopedA.printers.update(created.id, { tenantId: tenantB.id, make: 'Attempted takeover' } as any);

  const stillOwnedByA = await scopedA.printers.findById(created.id);
  assert.ok(stillOwnedByA, 'row should still belong to tenant A');
  assert.equal(stillOwnedByA?.make, 'Attempted takeover', 'the legitimate field should still update');
});

test('a tenant cannot see another tenant\'s filaments', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  await scopedA.filaments.create({ brand: 'eSun', materialType: 'PLA', diameterMm: 1.75 });
  await scopedB.filaments.create({ brand: 'Prusament', materialType: 'PETG', diameterMm: 1.75 });

  const aList = await scopedA.filaments.findMany();
  const bList = await scopedB.filaments.findMany();

  assert.equal(aList.length, 1);
  assert.equal(aList[0].brand, 'eSun');
  assert.equal(bList.length, 1);
  assert.equal(bList[0].brand, 'Prusament');
});

test('findById returns null for a filament belonging to a different tenant', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  const created = await scopedA.filaments.create({ brand: 'eSun', materialType: 'PLA', diameterMm: 1.75 });

  const foundByOwner = await scopedA.filaments.findById(created.id);
  const foundByOther = await scopedB.filaments.findById(created.id);

  assert.ok(foundByOwner);
  assert.equal(foundByOther, null);
});

test('a tenant cannot see another tenant\'s labour steps', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  await scopedA.labourSteps.create({ name: 'Slicing', hourlyRate: 100 });
  await scopedB.labourSteps.create({ name: 'Assembly', hourlyRate: 120 });

  const aList = await scopedA.labourSteps.findMany();
  const bList = await scopedB.labourSteps.findMany();

  assert.equal(aList.length, 1);
  assert.equal(aList[0].name, 'Slicing');
  assert.equal(bList.length, 1);
  assert.equal(bList[0].name, 'Assembly');
});

test('findById returns null for a labour step belonging to a different tenant', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  const created = await scopedA.labourSteps.create({ name: 'Slicing', hourlyRate: 100 });

  const foundByOwner = await scopedA.labourSteps.findById(created.id);
  const foundByOther = await scopedB.labourSteps.findById(created.id);

  assert.ok(foundByOwner);
  assert.equal(foundByOther, null);
});

test('a tenant cannot see another tenant\'s consumables', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  await scopedA.consumables.create({ name: 'Resin', category: 'resin', unitOfMeasure: 'ml', costPerUnit: 1 });
  await scopedB.consumables.create({ name: 'Nozzle', category: 'nozzle', unitOfMeasure: 'each', costPerUnit: 5 });

  const aList = await scopedA.consumables.findMany();
  const bList = await scopedB.consumables.findMany();

  assert.equal(aList.length, 1);
  assert.equal(aList[0].name, 'Resin');
  assert.equal(bList.length, 1);
  assert.equal(bList[0].name, 'Nozzle');
});

test('findById returns null for a consumable belonging to a different tenant', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  const created = await scopedA.consumables.create({ name: 'Resin', category: 'resin', unitOfMeasure: 'ml', costPerUnit: 1 });

  const foundByOwner = await scopedA.consumables.findById(created.id);
  const foundByOther = await scopedB.consumables.findById(created.id);

  assert.ok(foundByOwner);
  assert.equal(foundByOther, null);
});

test('a tenant cannot see another tenant\'s printer presets, even with a valid printer id', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const printerA = await prisma.printer.create({ data: { tenantId: tenantA.id, name: 'Printer 1' } });
  const printerB = await prisma.printer.create({ data: { tenantId: tenantB.id, name: 'Printer 1' } });

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  await scopedA.printerPresets.create(printerA.id, { name: 'PLA — Standard', materialType: 'PLA' });
  await scopedB.printerPresets.create(printerB.id, { name: 'PETG — Standard', materialType: 'PETG' });

  const aList = await scopedA.printerPresets.findMany(printerA.id);
  assert.equal(aList.length, 1);
  assert.equal(aList[0].name, 'PLA — Standard');

  // tenant B tries to read tenant A's presets using tenant A's real printer id
  const bListForAsPrinter = await scopedB.printerPresets.findMany(printerA.id);
  assert.equal(bListForAsPrinter.length, 0);

  const bFindById = await scopedB.printerPresets.findById(printerA.id, aList[0].id);
  assert.equal(bFindById, null);
});

test('printerPresets update cannot reassign a row via a smuggled tenantId or printerId', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const printerA = await prisma.printer.create({ data: { tenantId: tenantA.id, name: 'Printer 1' } });
  const printerB = await prisma.printer.create({ data: { tenantId: tenantB.id, name: 'Printer 1' } });

  const scopedA = tenantScope(tenantA.id);
  const created = await scopedA.printerPresets.create(printerA.id, { name: 'PLA — Standard', materialType: 'PLA' });

  // Same smuggled-field defense-in-depth check as the customers/printers
  // cases above, this time for both tenantId and printerId — the update
  // type has neither field, so `any` is required to build the attempt.
  await scopedA.printerPresets.update(printerA.id, created.id, {
    tenantId: tenantB.id,
    printerId: printerB.id,
    notes: 'attempted takeover',
  } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

  const stillOwnedByA = await scopedA.printerPresets.findById(printerA.id, created.id);
  assert.ok(stillOwnedByA, 'preset should still belong to printer A / tenant A');
  assert.equal(stillOwnedByA?.notes, 'attempted takeover', 'the legitimate field should still update');
});

test('a tenant cannot see another tenant\'s printer maintenance logs, even with a valid printer id', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const printerA = await prisma.printer.create({ data: { tenantId: tenantA.id, name: 'Printer 1' } });
  const printerB = await prisma.printer.create({ data: { tenantId: tenantB.id, name: 'Printer 1' } });

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  await scopedA.printerMaintenanceLogs.create(printerA.id, { date: '2026-09-01', description: 'Replaced nozzle' });
  await scopedB.printerMaintenanceLogs.create(printerB.id, { date: '2026-09-02', description: 'Bed leveling' });

  const aList = await scopedA.printerMaintenanceLogs.findMany(printerA.id);
  assert.equal(aList.length, 1);
  assert.equal(aList[0].description, 'Replaced nozzle');

  // tenant B tries to read tenant A's maintenance logs using tenant A's real printer id
  const bListForAsPrinter = await scopedB.printerMaintenanceLogs.findMany(printerA.id);
  assert.equal(bListForAsPrinter.length, 0);
});

test('a tenant cannot see another tenant\'s costing templates', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  await scopedA.costingTemplates.create({
    name: 'Tenant A template',
    filamentId: null,
    filamentSnapshotBrand: null,
    filamentSnapshotMaterialType: null,
    filamentSnapshotCostPerGram: null,
    weightGrams: 10,
    printerId: null,
    printerSnapshotName: null,
    printerSnapshotElectricityRatePerKwh: null,
    printerSnapshotDepreciationPerHour: null,
    printTimeHours: 1,
    markupPercent: '0',
    filamentCost: '1.00',
    electricityCost: '0.00',
    depreciationCost: '0.00',
    labourCost: '0.00',
    consumablesCost: '0.00',
    totalCost: '1.00',
    suggestedPrice: '1.00',
    labourLines: [],
    consumableLines: [],
  });

  const aList = await scopedA.costingTemplates.findMany();
  const bList = await scopedB.costingTemplates.findMany();

  assert.equal(aList.length, 1);
  assert.equal(bList.length, 0);

  const bFindById = await scopedB.costingTemplates.findById(aList[0].id);
  assert.equal(bFindById, null);
});

test('a tenant\'s sequence numbers are independent of another tenant\'s', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  assert.equal(await scopedA.tenantSequences.next('quote'), 1);
  assert.equal(await scopedB.tenantSequences.next('quote'), 1);
  assert.equal(await scopedA.tenantSequences.next('quote'), 2);
});

test('a tenant cannot see another tenant\'s quotes', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const customerA = await prisma.customer.create({
    data: { tenantId: tenantA.id, name: 'Customer A', billingAddress: '1 Main Rd' },
  });

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  await scopedA.quotes.create({
    customerId: customerA.id,
    number: 'QT-0001',
    validUntil: null,
    vatApplied: false,
    subtotal: '100.00',
    vatAmount: '0.00',
    total: '100.00',
    notes: null,
    lineItems: [
      { costingTemplateId: null, description: 'Custom bracket', quantity: 1, unitPrice: '100.00', lineTotal: '100.00' },
    ],
  });

  const aList = await scopedA.quotes.findMany();
  const bList = await scopedB.quotes.findMany();

  assert.equal(aList.length, 1);
  assert.equal(bList.length, 0);

  const bFindById = await scopedB.quotes.findById(aList[0].id);
  assert.equal(bFindById, null);
});

test('a tenant cannot see another tenant\'s invoices', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const customerA = await prisma.customer.create({
    data: { tenantId: tenantA.id, name: 'Customer A', billingAddress: '1 Main Rd' },
  });

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  await scopedA.invoices.create({
    customerId: customerA.id,
    quoteId: null,
    number: 'INV-0001',
    dueDate: new Date(),
    vatApplied: false,
    subtotal: '100.00',
    vatAmount: '0.00',
    total: '100.00',
    notes: null,
    lineItems: [
      {
        quoteLineItemId: null,
        costingTemplateId: null,
        description: 'Custom bracket',
        quantity: 1,
        unitPrice: '100.00',
        lineTotal: '100.00',
      },
    ],
  });

  const aList = await scopedA.invoices.findMany();
  const bList = await scopedB.invoices.findMany();

  assert.equal(aList.length, 1);
  assert.equal(bList.length, 0);

  const bFindById = await scopedB.invoices.findById(aList[0].id);
  assert.equal(bFindById, null);
});
