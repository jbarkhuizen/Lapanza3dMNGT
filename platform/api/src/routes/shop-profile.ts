import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { tenantScope } from '../db/scoped.js';

export const shopProfileRouter = Router();
// Auth/subscription gating is applied per-route (not via a blanket
// `.use()`) so a genuinely unmatched path that falls through to this
// router doesn't get a misleading 401 — it falls through to the next
// router / app.ts's final 404 handler instead. See backlog #6.

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const updateShopProfileSchema = z.object({
  shopSlug: z.string().min(3).max(60).regex(SLUG_RE).optional(),
  shopTagline: z.string().trim().optional(),
  shopServices: z.array(z.string().trim().min(1)).max(20).optional(),
  shopHoursText: z.string().trim().optional(),
  shopGalleryUrls: z.array(z.string().trim().url()).max(12).optional(),
  shopContactWhatsapp: z.string().trim().optional(),
  shopIsPublished: z.boolean().optional(),
});

shopProfileRouter.get('/api/shop-profile', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const profile = await scoped.shopProfile.get();
  res.json({ ok: true, shopProfile: profile });
});

shopProfileRouter.patch('/api/shop-profile', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const parsed = updateShopProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid shop profile fields.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const current = await scoped.shopProfile.get();
  if (current === null) {
    return res.status(404).json({ ok: false, error: 'Tenant not found.' });
  }
  const willBePublished = parsed.data.shopIsPublished ?? current.shopIsPublished;
  const willHaveSlug = parsed.data.shopSlug ?? current.shopSlug;
  if (willBePublished && !willHaveSlug) {
    return res.status(400).json({ ok: false, error: 'Set a URL slug before publishing your shop page.' });
  }
  try {
    const profile = await scoped.shopProfile.update(parsed.data);
    res.json({ ok: true, shopProfile: profile });
  } catch (error) {
    const isSlugCollision = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
    if (isSlugCollision) {
      return res.status(400).json({ ok: false, error: 'That URL is already taken — try a different one.' });
    }
    throw error;
  }
});
