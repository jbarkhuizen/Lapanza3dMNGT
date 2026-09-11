import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { tenantScope } from '../db/scoped.js';

export const jobsRouter = Router();
// Auth/subscription gating is applied per-route (not via a blanket
// `.use()`) so a genuinely unmatched path that falls through to this
// router doesn't get a misleading 401 — it falls through to the next
// router / app.ts's final 404 handler instead. See backlog #6.

const JOB_STATUSES = ['backlog', 'slicing', 'printing', 'post-processing', 'done'] as const;

const createJobSchema = z.object({
  costingTemplateId: z.string().min(1),
});

const updateJobStatusSchema = z.object({
  status: z.enum(JOB_STATUSES),
});

const updateJobSchema = z.object({
  notes: z.string().optional(),
});

jobsRouter.get('/api/jobs', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const jobs = await scoped.jobs.findMany();
  res.json({ ok: true, jobs });
});

jobsRouter.post('/api/jobs', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const parsed = createJobSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'A costing template is required.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const costingTemplate = await scoped.costingTemplates.findById(parsed.data.costingTemplateId);
  if (!costingTemplate) {
    return res.status(400).json({ ok: false, error: 'Costing template not found.' });
  }
  const job = await scoped.jobs.create({
    costingTemplateId: costingTemplate.id,
    name: costingTemplate.name,
  });
  res.status(201).json({ ok: true, job });
});

jobsRouter.patch('/api/jobs/:id/status', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const parsed = updateJobStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid status update.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const current = await scoped.jobs.findById(req.params.id);
  if (!current) {
    return res.status(404).json({ ok: false, error: 'Job not found.' });
  }

  const { status } = parsed.data;

  // startedAt is set the first time a job leaves "backlog", and never
  // overwritten by a later move — pass the existing value through
  // (undefined leaves it untouched via updateMany) unless this move is the
  // very first one out of "backlog".
  const startedAt =
    current.status === 'backlog' && status !== 'backlog' && current.startedAt === null ? new Date() : undefined;
  const completedAt = status === 'done' ? new Date() : current.status === 'done' ? null : current.completedAt;

  const job = await scoped.jobs.updateStatus(req.params.id, status, { startedAt, completedAt });
  if (!job) {
    return res.status(404).json({ ok: false, error: 'Job not found.' });
  }
  res.json({ ok: true, job });
});

jobsRouter.patch('/api/jobs/:id', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const parsed = updateJobSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid job fields.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const job = await scoped.jobs.update(req.params.id, parsed.data);
  if (!job) {
    return res.status(404).json({ ok: false, error: 'Job not found.' });
  }
  res.json({ ok: true, job });
});
