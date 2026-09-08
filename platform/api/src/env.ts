import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4200),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: required('DATABASE_URL'),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5174',
  // The SPA is served at the site root in dev, but under a path prefix
  // (`/app`) in production's path-based hosting — see
  // docs/superpowers/specs/2026-09-07-frontend-deploy-design.md.
  frontendBasePath: process.env.FRONTEND_BASE_PATH ?? '',
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? 'barkie_session',
  trustProxy: process.env.TRUST_PROXY === 'true',
  // Real SMTP is opt-in: unset in dev/test/CI (see src/lib/mailer.ts),
  // set only in the VPS's production .env. Never required() — a missing
  // value means "stay in dev-mode console-log", not a startup failure.
  smtpUser: process.env.SMTP_USER,
  smtpAppPassword: process.env.SMTP_APP_PASSWORD,
  smtpFromName: process.env.SMTP_FROM_NAME ?? 'Barkie',
};
