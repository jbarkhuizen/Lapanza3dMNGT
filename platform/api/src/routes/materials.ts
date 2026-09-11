import { Router } from 'express';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { prisma } from '../db/client.js';

export const materialsRouter = Router();
// Auth/subscription gating is applied per-route (not via a blanket
// `.use()`) so a genuinely unmatched path that falls through to this
// router doesn't get a misleading 401 — it falls through to the next
// router / app.ts's final 404 handler instead. See backlog #6.
//
// Material is a GLOBAL model (no tenantId, same status as Plan) — platform-
// curated reference data shared by every tenant. There is no tenantScope()
// involvement here; the two routes below are read-only and use `prisma`
// directly, gated only by requireTenantAuth/requireActiveSubscription so
// this stays tenant-gated read access rather than a public endpoint.

materialsRouter.get('/api/materials', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;
  const materials = await prisma.material.findMany({
    where: tag ? { tags: { has: tag } } : undefined,
  });
  res.json({ ok: true, materials });
});

materialsRouter.get('/api/materials/:id', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const material = await prisma.material.findUnique({ where: { id: req.params.id } });
  if (!material) {
    return res.status(404).json({ ok: false, error: 'Material not found.' });
  }
  res.json({ ok: true, material });
});
