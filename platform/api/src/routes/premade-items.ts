import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { tenantScope } from '../db/scoped.js';

export const premadeItemsRouter = Router();
// Auth/subscription gating is applied per-route (not via a blanket
// `.use()`) so a genuinely unmatched path that falls through to this
// router doesn't get a misleading 401 — it falls through to the next
// router / app.ts's final 404 handler instead. See backlog #6.

const createPremadeItemSchema = z.object({
  name: z.string().min(1),
  unitCost: z.number(),
  costMultiplier: z.number().optional(),
});

const updatePremadeItemSchema = createPremadeItemSchema.partial();

premadeItemsRouter.get('/api/premade-items', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const premadeItems = await scoped.premadeItems.findMany();
  res.json({ ok: true, premadeItems });
});

premadeItemsRouter.post('/api/premade-items', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const parsed = createPremadeItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Name and unit cost are required.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const premadeItem = await scoped.premadeItems.create(parsed.data);
  res.status(201).json({ ok: true, premadeItem });
});

premadeItemsRouter.get('/api/premade-items/:id', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const premadeItem = await scoped.premadeItems.findById(req.params.id);
  if (!premadeItem) {
    return res.status(404).json({ ok: false, error: 'Premade item not found.' });
  }
  res.json({ ok: true, premadeItem });
});

premadeItemsRouter.patch('/api/premade-items/:id', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const parsed = updatePremadeItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid premade item fields.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const result = await scoped.premadeItems.update(req.params.id, parsed.data);
  if (result.count === 0) {
    return res.status(404).json({ ok: false, error: 'Premade item not found.' });
  }
  res.json({ ok: true });
});

premadeItemsRouter.delete('/api/premade-items/:id', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const result = await scoped.premadeItems.delete(req.params.id);
  if (result.count === 0) {
    return res.status(404).json({ ok: false, error: 'Premade item not found.' });
  }
  res.json({ ok: true });
});
