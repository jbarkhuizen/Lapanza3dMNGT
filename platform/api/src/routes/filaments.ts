import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { tenantScope } from '../db/scoped.js';

export const filamentsRouter = Router();
filamentsRouter.use(requireTenantAuth);
filamentsRouter.use(requireActiveSubscription);

const createFilamentSchema = z.object({
  brand: z.string().min(1),
  materialType: z.string().min(1),
  diameterMm: z.union([z.literal(1.75), z.literal(2.85)]),
  colour: z.string().optional(),
  costPerSpool: z.number().optional(),
  costPerKg: z.number().optional(),
  spoolWeightGrams: z.number().optional(),
  remainingWeightGrams: z.number().optional(),
  supplier: z.string().optional(),
  purchaseDate: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Enter a valid date.').optional(),
  notes: z.string().optional(),
  lowStockThresholdGrams: z.number().optional(),
});

const updateFilamentSchema = createFilamentSchema.partial().extend({
  // Unlike create, PATCH must be able to explicitly clear purchaseDate (and
  // every optional numeric field below) back to null -- omitting the key
  // still leaves it untouched (see .partial() above), but an explicit `null`
  // is now accepted rather than rejected.
  purchaseDate: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), 'Enter a valid date.')
    .nullable()
    .optional(),
  costPerSpool: z.number().nullable().optional(),
  costPerKg: z.number().nullable().optional(),
  spoolWeightGrams: z.number().nullable().optional(),
  remainingWeightGrams: z.number().nullable().optional(),
  lowStockThresholdGrams: z.number().nullable().optional(),
});

filamentsRouter.get('/api/filaments', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const filaments = await scoped.filaments.findMany();
  res.json({ ok: true, filaments });
});

filamentsRouter.post('/api/filaments', async (req, res) => {
  const parsed = createFilamentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Brand, material type, and a diameter of 1.75 or 2.85mm are required.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const filament = await scoped.filaments.create(parsed.data);
  res.status(201).json({ ok: true, filament });
});

filamentsRouter.get('/api/filaments/:id', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const filament = await scoped.filaments.findById(req.params.id);
  if (!filament) {
    return res.status(404).json({ ok: false, error: 'Filament not found.' });
  }
  res.json({ ok: true, filament });
});

filamentsRouter.patch('/api/filaments/:id', async (req, res) => {
  const parsed = updateFilamentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid filament fields.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const result = await scoped.filaments.update(req.params.id, parsed.data);
  if (result.count === 0) {
    return res.status(404).json({ ok: false, error: 'Filament not found.' });
  }
  res.json({ ok: true });
});
