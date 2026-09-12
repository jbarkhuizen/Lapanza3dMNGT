import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { tenantScope } from '../db/scoped.js';

export const notificationsRouter = Router();
// Auth/subscription gating is applied per-route (not via a blanket
// `.use()`) so a genuinely unmatched path that falls through to this
// router doesn't get a misleading 401 — it falls through to the next
// router / app.ts's final 404 handler instead. See backlog #6.

notificationsRouter.get('/api/notifications', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const unreadOnly = req.query.unreadOnly === 'true';
  const notifications = await scoped.notifications.findMany(unreadOnly);
  res.json({ ok: true, notifications });
});

notificationsRouter.patch(
  '/api/notifications/:id/read',
  requireTenantAuth,
  requireActiveSubscription,
  async (req, res) => {
    const scoped = tenantScope(req.tenantId!);
    const notification = await scoped.notifications.markRead(req.params.id);
    if (!notification) {
      return res.status(404).json({ ok: false, error: 'Notification not found.' });
    }
    res.json({ ok: true, notification });
  },
);

notificationsRouter.post(
  '/api/notifications/mark-all-read',
  requireTenantAuth,
  requireActiveSubscription,
  async (req, res) => {
    const scoped = tenantScope(req.tenantId!);
    const result = await scoped.notifications.markAllRead();
    res.json({ ok: true, count: result.count });
  },
);

const updateNotificationPreferencesSchema = z.object({
  trialEndingInApp: z.boolean().optional(),
  trialEndingEmail: z.boolean().optional(),
  lowStockInApp: z.boolean().optional(),
  lowStockEmail: z.boolean().optional(),
  invoiceOverdueInApp: z.boolean().optional(),
  invoiceOverdueEmail: z.boolean().optional(),
  paymentReceiptInApp: z.boolean().optional(),
  subscriptionCancelledInApp: z.boolean().optional(),
  paymentFailedInApp: z.boolean().optional(),
});

notificationsRouter.get(
  '/api/notification-preferences',
  requireTenantAuth,
  requireActiveSubscription,
  async (req, res) => {
    const scoped = tenantScope(req.tenantId!);
    const preferences = await scoped.notificationPreference.getOrCreate();
    res.json({ ok: true, preferences });
  },
);

notificationsRouter.patch(
  '/api/notification-preferences',
  requireTenantAuth,
  requireActiveSubscription,
  async (req, res) => {
    const parsed = updateNotificationPreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'Invalid notification preference fields.' });
    }
    const scoped = tenantScope(req.tenantId!);
    await scoped.notificationPreference.getOrCreate();
    const preferences = await scoped.notificationPreference.update(parsed.data);
    res.json({ ok: true, preferences });
  },
);
