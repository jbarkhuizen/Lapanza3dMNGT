import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { tenantScope } from '../db/scoped.js';

export const laserMaterialsRouter = Router();
// Auth/subscription gating is applied per-route (not via a blanket
// `.use()`) so a genuinely unmatched path that falls through to this
// router doesn't get a misleading 401 — it falls through to the next
// router / app.ts's final 404 handler instead. See backlog #6.

const createLaserMaterialSchema = z.object({
  name: z.string().min(1),
  sheetPrice: z.number(),
  sheetAreaM2: z.number().positive(),
  usableSheetAreaM2: z.number().positive(),
  costMultiplier: z.number().optional(),
});

const updateLaserMaterialSchema = createLaserMaterialSchema.partial();

laserMaterialsRouter.get('/api/laser-materials', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const laserMaterials = await scoped.laserMaterials.findMany();
  res.json({ ok: true, laserMaterials });
});

laserMaterialsRouter.post('/api/laser-materials', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const parsed = createLaserMaterialSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: 'Name, sheet price, sheet area, and usable sheet area are required.',
    });
  }
  const scoped = tenantScope(req.tenantId!);
  const laserMaterial = await scoped.laserMaterials.create(parsed.data);
  res.status(201).json({ ok: true, laserMaterial });
});

laserMaterialsRouter.get('/api/laser-materials/:id', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const laserMaterial = await scoped.laserMaterials.findById(req.params.id);
  if (!laserMaterial) {
    return res.status(404).json({ ok: false, error: 'Laser material not found.' });
  }
  res.json({ ok: true, laserMaterial });
});

laserMaterialsRouter.patch('/api/laser-materials/:id', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const parsed = updateLaserMaterialSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid laser material fields.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const result = await scoped.laserMaterials.update(req.params.id, parsed.data);
  if (result.count === 0) {
    return res.status(404).json({ ok: false, error: 'Laser material not found.' });
  }
  res.json({ ok: true });
});

laserMaterialsRouter.delete('/api/laser-materials/:id', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const result = await scoped.laserMaterials.delete(req.params.id);
  if (result.count === 0) {
    return res.status(404).json({ ok: false, error: 'Laser material not found.' });
  }
  res.json({ ok: true });
});
