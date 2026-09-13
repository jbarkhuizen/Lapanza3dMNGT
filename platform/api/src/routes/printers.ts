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
// Auth/subscription gating is applied per-route (not via a blanket
// `.use()`) so a genuinely unmatched path that falls through to this
// router doesn't get a misleading 401 — it falls through to the next
// router / app.ts's final 404 handler instead. See backlog #6.

const STATUSES = ['active', 'maintenance', 'retired'] as const;
// A laser cutter/engraver is tracked as a Printer row too -- see the design
// spec's "Data model" section -- the same purchase-cost/hours/electricity
// depreciation formula applies uniformly across all three; only *material*
// costing differs by process (CostingTemplate.process).
const PROCESSES = ['fdm', 'resin', 'laser'] as const;

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
  process: z.enum(PROCESSES).optional(),
});

const updatePrinterSchema = createPrinterSchema.partial().extend({
  // Unlike create, PATCH must be able to explicitly clear purchaseDate (and
  // every optional numeric field below) back to null -- omitting the key
  // still leaves it untouched (see .partial() above), but an explicit `null`
  // is now accepted rather than rejected.
  purchaseDate: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), 'Enter a valid date.')
    .nullable()
    .optional(),
  buildVolumeXMm: z.number().nullable().optional(),
  buildVolumeYMm: z.number().nullable().optional(),
  buildVolumeZMm: z.number().nullable().optional(),
  purchaseCost: z.number().nullable().optional(),
  powerDrawWatts: z.number().nullable().optional(),
  electricityRatePerKwh: z.number().nonnegative().nullable().optional(),
  expectedLifetimeHours: z.number().positive().nullable().optional(),
});

printersRouter.get('/api/printers', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const printers = await scoped.printers.findMany();
  res.json({ ok: true, printers: printers.map(serializePrinter) });
});

printersRouter.post('/api/printers', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const parsed = createPrinterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Printer name is required.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const printer = await scoped.printers.create(parsed.data);
  res.status(201).json({ ok: true, printer: serializePrinter(printer) });
});

printersRouter.get('/api/printers/:id', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const printer = await scoped.printers.findById(req.params.id);
  if (!printer) {
    return res.status(404).json({ ok: false, error: 'Printer not found.' });
  }
  res.json({ ok: true, printer: serializePrinter(printer) });
});

printersRouter.patch('/api/printers/:id', requireTenantAuth, requireActiveSubscription, async (req, res) => {
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
