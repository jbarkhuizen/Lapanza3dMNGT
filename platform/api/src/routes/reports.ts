import { Router } from 'express';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { prisma } from '../db/client.js';
import { overdueInvoiceWhere } from '../notifications/checks.js';
import { serializeInvoice } from './invoices.js';

export const reportsRouter = Router();
// Auth/subscription gating is applied per-route (not via a blanket
// `.use()`) so a genuinely unmatched path that falls through to this
// router doesn't get a misleading 401 — it falls through to the next
// router / app.ts's final 404 handler instead. See backlog #6.

reportsRouter.get('/api/reports/summary', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const tenantId = req.tenantId!;

  const revenueAgg = await prisma.invoice.aggregate({
    where: { tenantId, status: 'paid' },
    _sum: { total: true },
  });
  const totalRevenue = revenueAgg._sum.total ? revenueAgg._sum.total.toFixed(2) : '0.00';

  const openQuotesCount = await prisma.quote.count({
    where: { tenantId, status: { in: ['draft', 'sent'] } },
  });

  const overdueInvoicesRaw = await prisma.invoice.findMany({
    where: overdueInvoiceWhere(tenantId),
    include: { lineItems: true },
    orderBy: { dueDate: 'asc' },
  });
  const overdueInvoices = overdueInvoicesRaw.map(serializeInvoice);

  const [lowStockFilaments, lowStockConsumables] = await Promise.all([
    prisma.filament.findMany({
      where: { tenantId, remainingWeightGrams: { not: null }, lowStockThresholdGrams: { not: null } },
    }),
    prisma.consumable.findMany({
      where: { tenantId, reorderThreshold: { not: null } },
    }),
  ]);

  const lowStockItems = [
    ...lowStockFilaments
      .filter(
        (filament) =>
          filament.remainingWeightGrams !== null &&
          filament.lowStockThresholdGrams !== null &&
          filament.remainingWeightGrams <= filament.lowStockThresholdGrams,
      )
      .map((filament) => ({
        kind: 'filament' as const,
        id: filament.id,
        name: `${filament.brand} ${filament.materialType}`,
        remaining: filament.remainingWeightGrams,
        threshold: filament.lowStockThresholdGrams,
      })),
    ...lowStockConsumables
      .filter((consumable) => consumable.reorderThreshold !== null && consumable.currentStock <= consumable.reorderThreshold)
      .map((consumable) => ({
        kind: 'consumable' as const,
        id: consumable.id,
        name: consumable.name,
        remaining: consumable.currentStock,
        threshold: consumable.reorderThreshold,
      })),
  ];

  const jobsInProgress = await prisma.job.count({
    where: { tenantId, status: { notIn: ['backlog', 'done'] } },
  });

  res.json({
    ok: true,
    totalRevenue,
    openQuotesCount,
    overdueInvoices,
    lowStockItems,
    jobsInProgress,
  });
});
