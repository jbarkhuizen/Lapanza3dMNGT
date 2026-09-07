import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { tenantScope } from '../db/scoped.js';

export const labourStepsRouter = Router();
labourStepsRouter.use(requireTenantAuth);

const createLabourStepSchema = z.object({
  name: z.string().min(1),
  hourlyRate: z.number(),
  active: z.boolean().optional(),
});

const updateLabourStepSchema = createLabourStepSchema.partial();

labourStepsRouter.get('/api/labour-steps', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const labourSteps = await scoped.labourSteps.findMany();
  res.json({ ok: true, labourSteps });
});

labourStepsRouter.post('/api/labour-steps', async (req, res) => {
  const parsed = createLabourStepSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Name and hourly rate are required.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const labourStep = await scoped.labourSteps.create(parsed.data);
  res.status(201).json({ ok: true, labourStep });
});

labourStepsRouter.get('/api/labour-steps/:id', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const labourStep = await scoped.labourSteps.findById(req.params.id);
  if (!labourStep) {
    return res.status(404).json({ ok: false, error: 'Labour step not found.' });
  }
  res.json({ ok: true, labourStep });
});

labourStepsRouter.patch('/api/labour-steps/:id', async (req, res) => {
  const parsed = updateLabourStepSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid labour step fields.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const result = await scoped.labourSteps.update(req.params.id, parsed.data);
  if (result.count === 0) {
    return res.status(404).json({ ok: false, error: 'Labour step not found.' });
  }
  res.json({ ok: true });
});
