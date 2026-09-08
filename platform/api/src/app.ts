import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './env.js';
import { healthRouter } from './routes/health.js';
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
import { quotesRouter } from './routes/quotes.js';
import { invoicesRouter } from './routes/invoices.js';
import { billingRouter } from './routes/billing.js';
import { webhooksRouter } from './routes/webhooks.js';

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
  app.use(express.json());
  app.use(cookieParser());
  app.use(healthRouter);
  app.use(createAuthRouter());
  // Mounted here (before the auth-protected routers below) because every one
  // of those routers applies `requireTenantAuth` via an unpathed `router.use`,
  // which — since each router is itself mounted at `/` — intercepts every
  // request that flows into it, not just requests matching its own routes.
  // Payment-provider webhooks arrive with no session cookie, so webhooksRouter
  // must get first refusal on its own paths before any blanket-auth router
  // can short-circuit the request to a 401. webhooksRouter has no such
  // blanket middleware itself, so unrelated requests pass through untouched.
  app.use(webhooksRouter);
  app.use(customersRouter);
  app.use(printersRouter);
  app.use(printerPresetsRouter);
  app.use(printerMaintenanceRouter);
  app.use(filamentsRouter);
  app.use(labourStepsRouter);
  app.use(consumablesRouter);
  app.use(costingTemplatesRouter);
  app.use(companyProfileRouter);
  app.use(quotesRouter);
  app.use(invoicesRouter);
  app.use(billingRouter);

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
