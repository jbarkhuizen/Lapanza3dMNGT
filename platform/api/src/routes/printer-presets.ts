import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { tenantScope } from '../db/scoped.js';

export const printerPresetsRouter = Router();
// Auth/subscription gating is applied per-route (not via a blanket
// `.use()`) so a genuinely unmatched path that falls through to this
// router doesn't get a misleading 401 — it falls through to the next
// router / app.ts's final 404 handler instead. See backlog #6.

const createPresetSchema = z.object({
  name: z.string().min(1),
  materialType: z.string().min(1),
  nozzleTempC: z.number().optional(),
  bedTempC: z.number().optional(),
  printSpeedMmS: z.number().optional(),
  layerHeightMm: z.number().optional(),
  infillPercent: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
});

const updatePresetSchema = createPresetSchema.partial();

async function requireOwnedPrinter(tenantId: string, printerId: string) {
  const scoped = tenantScope(tenantId);
  return scoped.printers.findById(printerId);
}

printerPresetsRouter.get('/api/printers/:printerId/presets', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const printer = await requireOwnedPrinter(req.tenantId!, req.params.printerId);
  if (!printer) {
    return res.status(404).json({ ok: false, error: 'Printer not found.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const presets = await scoped.printerPresets.findMany(req.params.printerId);
  res.json({ ok: true, presets });
});

printerPresetsRouter.post('/api/printers/:printerId/presets', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const printer = await requireOwnedPrinter(req.tenantId!, req.params.printerId);
  if (!printer) {
    return res.status(404).json({ ok: false, error: 'Printer not found.' });
  }
  const parsed = createPresetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Preset name and material type are required.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const preset = await scoped.printerPresets.create(req.params.printerId, parsed.data);
  res.status(201).json({ ok: true, preset });
});

printerPresetsRouter.patch('/api/printers/:printerId/presets/:id', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const printer = await requireOwnedPrinter(req.tenantId!, req.params.printerId);
  if (!printer) {
    return res.status(404).json({ ok: false, error: 'Printer not found.' });
  }
  const parsed = updatePresetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid preset fields.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const result = await scoped.printerPresets.update(req.params.printerId, req.params.id, parsed.data);
  if (result.count === 0) {
    return res.status(404).json({ ok: false, error: 'Preset not found.' });
  }
  res.json({ ok: true });
});
