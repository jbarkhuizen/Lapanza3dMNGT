import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { tenantScope } from '../db/scoped.js';

export const printerPresetsRouter = Router();
printerPresetsRouter.use(requireTenantAuth);

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

printerPresetsRouter.get('/api/printers/:printerId/presets', async (req, res) => {
  const printer = await requireOwnedPrinter(req.tenantId!, req.params.printerId);
  if (!printer) {
    return res.status(404).json({ ok: false, error: 'Printer not found.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const presets = await scoped.printerPresets.findMany(req.params.printerId);
  res.json({ ok: true, presets });
});

printerPresetsRouter.post('/api/printers/:printerId/presets', async (req, res) => {
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

printerPresetsRouter.patch('/api/printers/:printerId/presets/:id', async (req, res) => {
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
