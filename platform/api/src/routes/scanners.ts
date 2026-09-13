import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { tenantScope } from '../db/scoped.js';

export const scannersRouter = Router();
// Auth/subscription gating is applied per-route (not via a blanket
// `.use()`) so a genuinely unmatched path that falls through to this
// router doesn't get a misleading 401 — it falls through to the next
// router / app.ts's final 404 handler instead. See backlog #6.

const createScannerSchema = z.object({
  name: z.string().min(1),
  scannerCost: z.number(),
  expectedScanHours: z.number().positive(),
  powerCostPerHour: z.number().optional(),
});

const updateScannerSchema = createScannerSchema.partial();

scannersRouter.get('/api/scanners', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const scanners = await scoped.scanners.findMany();
  res.json({ ok: true, scanners });
});

scannersRouter.post('/api/scanners', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const parsed = createScannerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Name, scanner cost, and expected scan hours are required.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const scanner = await scoped.scanners.create(parsed.data);
  res.status(201).json({ ok: true, scanner });
});

scannersRouter.get('/api/scanners/:id', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const scanner = await scoped.scanners.findById(req.params.id);
  if (!scanner) {
    return res.status(404).json({ ok: false, error: 'Scanner not found.' });
  }
  res.json({ ok: true, scanner });
});

scannersRouter.patch('/api/scanners/:id', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const parsed = updateScannerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid scanner fields.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const result = await scoped.scanners.update(req.params.id, parsed.data);
  if (result.count === 0) {
    return res.status(404).json({ ok: false, error: 'Scanner not found.' });
  }
  res.json({ ok: true });
});

scannersRouter.delete('/api/scanners/:id', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const result = await scoped.scanners.delete(req.params.id);
  if (result.count === 0) {
    return res.status(404).json({ ok: false, error: 'Scanner not found.' });
  }
  res.json({ ok: true });
});
