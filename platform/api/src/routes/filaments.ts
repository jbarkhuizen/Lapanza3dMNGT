import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { tenantScope } from '../db/scoped.js';

export const filamentsRouter = Router();
filamentsRouter.use(requireTenantAuth);

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
  purchaseDate: z.string().optional(),
  notes: z.string().optional(),
  lowStockThresholdGrams: z.number().optional(),
});

const updateFilamentSchema = createFilamentSchema.partial();

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
