import { Router } from 'express';
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
