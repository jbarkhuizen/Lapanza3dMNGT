import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './env.js';
import { healthRouter } from './routes/health.js';
import { publicRouter } from './routes/public.js';
import { createAuthRouter } from './routes/auth.js';
import { customersRouter } from './routes/customers.js';
import { printersRouter } from './routes/printers.js';
import { printerPresetsRouter } from './routes/printer-presets.js';
import { printerMaintenanceRouter } from './routes/printer-maintenance.js';
import { filamentsRouter } from './routes/filaments.js';
import { labourStepsRouter } from './routes/labour-steps.js';
import { consumablesRouter } from './routes/consumables.js';
import { costingTemplatesRouter } from './routes/costing-templates.js';
import { companyProfileRouter } from './routes/company-profile.js';
import { shopProfileRouter } from './routes/shop-profile.js';
import { materialsRouter } from './routes/materials.js';
import { quotesRouter } from './routes/quotes.js';
import { invoicesRouter } from './routes/invoices.js';
import { jobsRouter } from './routes/jobs.js';
import { jobCardsRouter } from './routes/job-cards.js';
import { notificationsRouter } from './routes/notifications.js';
import { featureRequestsRouter } from './routes/feature-requests.js';
import { reportsRouter } from './routes/reports.js';
import { billingRouter } from './routes/billing.js';
import { teamRouter } from './routes/team.js';
import { webhooksRouter } from './routes/webhooks.js';
import { adminRouter } from './routes/admin.js';

export function buildApp() {
  const app = express();
  if (env.trustProxy) {
    // Trust exactly one hop (the immediate reverse proxy) so express-rate-limit
    // and req.ip key on the real client IP instead of the proxy's IP. Using
    // `true` here would trust the entire X-Forwarded-For chain, letting a
    // malicious client spoof their apparent IP.
    app.set('trust proxy', 1);
  }
  app.use(cors({ origin: env.frontendOrigin, credentials: true }));
  // PayPal's webhook signature check (see paypalProvider.ts's
  // verifyWebhookSignature) must send PayPal the EXACT bytes it originally
  // posted, not a re-serialized JSON.stringify(req.body) — a known source
  // of intermittent verification failures. Capture those raw bytes onto
  // req.rawBody, scoped to just this one path and registered BEFORE the
  // blanket express.json() below: body-parser's own "already parsed" guard
  // then makes the blanket parser skip re-parsing this route's body, so no
  // other route's request-body handling changes.
  app.use(
    '/api/webhooks/paypal',
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(express.json());
  // PayFast's ITN webhook POSTs as application/x-www-form-urlencoded, not
  // JSON (PayPal's webhook is genuine JSON, handled by express.json() above).
  // Express only invokes the parser matching the request's actual
  // Content-Type, so registering both here is safe — each activates only
  // for its own content type.
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use(healthRouter);
  app.use(publicRouter);
  app.use(createAuthRouter());
  // adminRouter applies its own auth gate (requirePlatformAdminAuth) per
  // route, not via a blanket `router.use` — see requireTenantAuth.ts and
  // backlog #6 — so GET/POST /api/admin/login (which must be reachable with
  // no session at all) is never at risk of being intercepted by an earlier
  // router's auth check regardless of mount order. Kept mounted here, ahead
  // of the resource routers below, purely to group "platform-level" routers
  // (health/public/auth/admin/webhooks/billing) before per-tenant resource
  // routers — not because correctness now depends on it.
  app.use('/api/admin', adminRouter);
  // webhooksRouter has no auth of its own (payment-provider webhooks arrive
  // with no session cookie) and none of the routers below define any
  // `/api/webhooks/*` route, so mount order relative to them doesn't affect
  // correctness. Kept here with the other platform-level routers for the
  // same grouping reason as adminRouter above.
  app.use(webhooksRouter);
  // billingRouter applies requireTenantAuth per route (like every resource
  // router below — see requireTenantAuth.ts and backlog #6), so a tenant
  // with no subscription yet can still reach POST /api/billing/checkout (the
  // endpoint that gives them one) regardless of mount order: the
  // subscription-gating routers below only ever gate their OWN routes now,
  // never billing's. Kept here for the same platform-level grouping reason
  // as adminRouter/webhooksRouter above.
  app.use(billingRouter);
  app.use(customersRouter);
  app.use(printersRouter);
  app.use(printerPresetsRouter);
  app.use(printerMaintenanceRouter);
  app.use(filamentsRouter);
  app.use(labourStepsRouter);
  app.use(consumablesRouter);
  app.use(costingTemplatesRouter);
  app.use(companyProfileRouter);
  app.use(shopProfileRouter);
  app.use(materialsRouter);
  app.use(quotesRouter);
  app.use(invoicesRouter);
  app.use(jobsRouter);
  app.use(jobCardsRouter);
  app.use(notificationsRouter);
  app.use(featureRequestsRouter);
  app.use(reportsRouter);
  app.use(teamRouter);

  // Catch-all for anything that fell through every router above without
  // matching a route. Must be mounted after all real routers (so it never
  // shadows a genuine route) and before the error-handling middleware below
  // (a 4-arg handler, only invoked on `next(err)`, so it would never see a
  // plain unmatched request anyway) — otherwise an unmatched path would fall
  // through to Express's default handler, or worse, get swallowed by an
  // unpathed `router.use(requireTenantAuth)` in one of the routers above,
  // which would 401 (and pay for a session DB lookup) instead of 404.
  app.use((req: Request, res: Response) => {
    res.status(404).json({ ok: false, error: 'Not found.' });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    if (res.headersSent) {
      return;
    }
    res.status(500).json({ ok: false, error: 'Something went wrong. Try again shortly.' });
  });

  return app;
}
