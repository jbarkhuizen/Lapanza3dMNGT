import { Router } from 'express';
import { prisma } from '../db/client.js';

export const publicRouter = Router();

publicRouter.get('/api/public/stats', async (_req, res) => {
  const [registeredBusinesses, activeSubscriptions] = await Promise.all([
    prisma.tenant.count(),
    prisma.subscription.count({ where: { status: { in: ['active', 'trialing'] } } }),
  ]);
  res.json({ ok: true, registeredBusinesses, activeSubscriptions });
});

publicRouter.get('/api/public/plans', async (_req, res) => {
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
