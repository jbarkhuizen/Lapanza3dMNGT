import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db/client.js';

export const publicRouter = Router();

// These are the first fully-unauthenticated, database-touching endpoints in
// this API — there's no account identity to key a limiter off of like
// auth.ts's loginLimiter/accountLimiter, so this is a flat per-IP cap
// against scraping/DoS on otherwise-open routes.
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

publicRouter.get('/api/public/stats', publicLimiter, async (_req, res) => {
  const [registeredBusinesses, activeSubscriptions] = await Promise.all([
    prisma.tenant.count(),
    prisma.subscription.count({ where: { status: { in: ['active', 'trialing'] } } }),
  ]);
  res.json({ ok: true, registeredBusinesses, activeSubscriptions });
});

publicRouter.get('/api/public/plans', publicLimiter, async (_req, res) => {
  const plans = await prisma.plan.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
  });
  res.json({
    ok: true,
    plans: plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      monthlyPrice: plan.monthlyPrice.toFixed(2),
      sortOrder: plan.sortOrder,
    })),
  });
});

publicRouter.get('/api/public/shop/:slug', publicLimiter, async (req, res) => {
  const shop = await prisma.tenant.findFirst({
    where: { shopSlug: String(req.params.slug), shopIsPublished: true },
    select: {
      businessName: true,
      shopTagline: true,
      shopServices: true,
      shopHoursText: true,
      shopGalleryUrls: true,
      shopContactWhatsapp: true,
      phone: true,
      email: true,
      website: true,
      logoUrl: true,
      city: true,
    },
  });
  // Same 404 + message whether the slug doesn't exist at all or exists but is
  // unpublished -- otherwise the response would leak which slugs are taken.
  if (!shop) {
    return res.status(404).json({ ok: false, error: 'Shop not found.' });
  }
  res.json({ ok: true, shop });
});
