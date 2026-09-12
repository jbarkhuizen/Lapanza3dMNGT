import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { tenantScope } from '../db/scoped.js';
import { prisma } from '../db/client.js';

export const featureRequestsRouter = Router();
// Auth/subscription gating is applied per-route (not via a blanket
// `.use()`) so a genuinely unmatched path that falls through to this
// router doesn't get a misleading 401 — it falls through to the next
// router / app.ts's final 404 handler instead. See backlog #6.

const createFeatureRequestSchema = z.object({
  category: z.enum(['new_feature', 'workflow', 'bug']),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
});

featureRequestsRouter.post('/api/feature-requests', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const parsed = createFeatureRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'A category, title, and description are required.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const featureRequest = await scoped.featureRequests.create(parsed.data);
  res.status(201).json({ ok: true, featureRequest });
});

featureRequestsRouter.get('/api/feature-requests/mine', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const featureRequests = await scoped.featureRequests.findMyRequests();
  res.json({ ok: true, featureRequests });
});

// The community list — every tenant's requests, without exposing which
// tenant submitted each one. See scoped.ts's `featureRequests.findAll` for
// why this query is deliberately not tenant-scoped, and why its select
// never includes `tenantId`.
featureRequestsRouter.get('/api/feature-requests', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const sort = req.query.sort === 'recent' ? 'recent' : 'votes';
  const scoped = tenantScope(req.tenantId!);
  const featureRequests = await scoped.featureRequests.findAll(sort);
  res.json({ ok: true, featureRequests });
});

featureRequestsRouter.post(
  '/api/feature-requests/:id/vote',
  requireTenantAuth,
  requireActiveSubscription,
  async (req, res) => {
    const { id } = req.params;
    const existing = await prisma.featureRequest.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'Feature request not found.' });
    }

    const scoped = tenantScope(req.tenantId!);
    const result = await scoped.featureRequests.vote(id);
    let hasVoted: boolean;
    if (result.status === 'already_voted') {
      // Toggle: a second vote from the same tenant on the same request
      // removes their existing vote instead of erroring — this is what
      // makes the vote button in the UI behave as a toggle.
      await scoped.featureRequests.unvote(id);
      hasVoted = false;
    } else {
      hasVoted = true;
    }

    const voteCount = await scoped.featureRequests.voteCount(id);
    res.json({ ok: true, voteCount, hasVoted });
  },
);
