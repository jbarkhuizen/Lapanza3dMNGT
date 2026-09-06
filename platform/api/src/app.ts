import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './env.js';
import { healthRouter } from './routes/health.js';

export function buildApp() {
  const app = express();
  app.use(cors({ origin: env.frontendOrigin, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(healthRouter);
  return app;
}
