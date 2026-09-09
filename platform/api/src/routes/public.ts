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
