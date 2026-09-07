import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { tenantScope } from '../db/scoped.js';

export const printersRouter = Router();
printersRouter.use(requireTenantAuth);

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
  status: z.enum(STATUSES).optional(),
});

const updatePrinterSchema = createPrinterSchema.partial();

printersRouter.get('/api/printers', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const printers = await scoped.printers.findMany();
  res.json({ ok: true, printers });
});

printersRouter.post('/api/printers', async (req, res) => {
  const parsed = createPrinterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Printer name is required.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const printer = await scoped.printers.create(parsed.data);
  res.status(201).json({ ok: true, printer });
});

printersRouter.get('/api/printers/:id', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const printer = await scoped.printers.findById(req.params.id);
  if (!printer) {
    return res.status(404).json({ ok: false, error: 'Printer not found.' });
  }
  res.json({ ok: true, printer });
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
