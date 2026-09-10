import { Router } from 'express';
import { z } from 'zod';
import type { Printer } from '@prisma/client';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { tenantScope } from '../db/scoped.js';

export const printersRouter = Router();

// Prisma's Decimal normalizes trailing zeros away by default (toString()
// on `new Decimal('2.5000')` gives '2.5', not '2.5000') -- fix the display
// scale only at the HTTP boundary, not in scoped.ts, so the data layer
// keeps returning a real Decimal instance for callers (the costing engine)
// that need to do Decimal arithmetic on it.
function serializePrinter(printer: Printer) {
  return {
    ...printer,
    electricityRatePerKwh: printer.electricityRatePerKwh != null ? printer.electricityRatePerKwh.toFixed(4) : null,
  };
}
printersRouter.use(requireTenantAuth);
printersRouter.use(requireActiveSubscription);

const STATUSES = ['active', 'maintenance', 'retired'] as const;

const createPrinterSchema = z.object({
  name: z.string().min(1),
  make: z.string().optional(),
  model: z.string().optional(),
  buildVolumeXMm: z.number().optional(),
  buildVolumeYMm: z.number().optional(),
  buildVolumeZMm: z.number().optional(),
  purchaseDate: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Enter a valid date.').optional(),
  purchaseCost: z.number().optional(),
  powerDrawWatts: z.number().optional(),
  electricityRatePerKwh: z.number().nonnegative().optional(),
  expectedLifetimeHours: z.number().positive().optional(),
  status: z.enum(STATUSES).optional(),
});

const updatePrinterSchema = createPrinterSchema.partial().extend({
  // Unlike create, PATCH must be able to explicitly clear purchaseDate back
  // to null -- omitting the key still leaves it untouched (see .partial()
  // above), but an explicit `null` is now accepted rather than rejected.
  purchaseDate: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), 'Enter a valid date.')
    .nullable()
    .optional(),
});

printersRouter.get('/api/printers', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const printers = await scoped.printers.findMany();
  res.json({ ok: true, printers: printers.map(serializePrinter) });
});

printersRouter.post('/api/printers', async (req, res) => {
  const parsed = createPrinterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Printer name is required.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const printer = await scoped.printers.create(parsed.data);
  res.status(201).json({ ok: true, printer: serializePrinter(printer) });
});

printersRouter.get('/api/printers/:id', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const printer = await scoped.printers.findById(req.params.id);
  if (!printer) {
    return res.status(404).json({ ok: false, error: 'Printer not found.' });
  }
  res.json({ ok: true, printer: serializePrinter(printer) });
});

printersRouter.patch('/api/printers/:id', async (req, res) => {
  const parsed = updatePrinterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid printer fields.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const result = await scoped.printers.update(req.params.id, parsed.data);
  if (result.count === 0) {
    return res.status(404).json({ ok: false, error: 'Printer not found.' });
  }
  res.json({ ok: true });
});
