import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { tenantScope } from '../db/scoped.js';

export const printerMaintenanceRouter = Router();
printerMaintenanceRouter.use(requireTenantAuth);
printerMaintenanceRouter.use(requireActiveSubscription);

const createMaintenanceLogSchema = z.object({
  date: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Enter a valid date.'),
  description: z.string().min(1),
  cost: z.number().optional(),
  performedBy: z.string().optional(),
});

async function requireOwnedPrinter(tenantId: string, printerId: string) {
  const scoped = tenantScope(tenantId);
  return scoped.printers.findById(printerId);
}

printerMaintenanceRouter.get('/api/printers/:printerId/maintenance-log', async (req, res) => {
  const printer = await requireOwnedPrinter(req.tenantId!, req.params.printerId);
  if (!printer) {
    return res.status(404).json({ ok: false, error: 'Printer not found.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const entries = await scoped.printerMaintenanceLogs.findMany(req.params.printerId);
  res.json({ ok: true, entries });
});

printerMaintenanceRouter.post('/api/printers/:printerId/maintenance-log', async (req, res) => {
  const printer = await requireOwnedPrinter(req.tenantId!, req.params.printerId);
  if (!printer) {
    return res.status(404).json({ ok: false, error: 'Printer not found.' });
  }
  const parsed = createMaintenanceLogSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Date and description are required.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const entry = await scoped.printerMaintenanceLogs.create(req.params.printerId, parsed.data);
  res.status(201).json({ ok: true, entry });
});
