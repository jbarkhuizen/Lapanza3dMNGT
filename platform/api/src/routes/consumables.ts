import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { tenantScope } from '../db/scoped.js';

export const consumablesRouter = Router();
consumablesRouter.use(requireTenantAuth);
consumablesRouter.use(requireActiveSubscription);

const CATEGORIES = ['resin', 'nozzle', 'build-plate-adhesive', 'post-processing', 'packaging', 'other'] as const;

const createConsumableSchema = z.object({
  name: z.string().min(1),
  category: z.enum(CATEGORIES),
  unitOfMeasure: z.string().min(1),
  costPerUnit: z.number(),
  currentStock: z.number().optional(),
  reorderThreshold: z.number().optional(),
  supplier: z.string().optional(),
});

const updateConsumableSchema = createConsumableSchema.partial().extend({
  // Unlike create, PATCH must be able to explicitly clear reorderThreshold
  // back to null -- omitting the key still leaves it untouched (see
  // .partial() above), but an explicit `null` is now accepted rather than
  // rejected. `currentStock` has no null variant: the column is non-nullable
  // with a DB default, so it stays a plain optional number.
  reorderThreshold: z.number().nullable().optional(),
});

consumablesRouter.get('/api/consumables', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const consumables = await scoped.consumables.findMany();
  res.json({ ok: true, consumables });
});

consumablesRouter.post('/api/consumables', async (req, res) => {
  const parsed = createConsumableSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Name, a valid category, unit of measure, and cost per unit are required.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const consumable = await scoped.consumables.create(parsed.data);
  res.status(201).json({ ok: true, consumable });
});

consumablesRouter.get('/api/consumables/:id', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const consumable = await scoped.consumables.findById(req.params.id);
  if (!consumable) {
    return res.status(404).json({ ok: false, error: 'Consumable not found.' });
  }
  res.json({ ok: true, consumable });
});

consumablesRouter.patch('/api/consumables/:id', async (req, res) => {
  const parsed = updateConsumableSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid consumable fields.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const result = await scoped.consumables.update(req.params.id, parsed.data);
  if (result.count === 0) {
    return res.status(404).json({ ok: false, error: 'Consumable not found.' });
  }
  res.json({ ok: true });
});
