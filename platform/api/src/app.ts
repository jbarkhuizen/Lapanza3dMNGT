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
  app.use(customersRouter);
  app.use(printersRouter);
  app.use(printerPresetsRouter);
  app.use(printerMaintenanceRouter);
  app.use(filamentsRouter);

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
