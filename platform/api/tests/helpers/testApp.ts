import express, { Router } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/db/client.js';

const SEED_PLANS = [
  { name: 'Tier 1', monthlyPrice: '25.00', sortOrder: 1 },
  { name: 'Tier 2', monthlyPrice: '45.00', sortOrder: 2 },
  { name: 'Tier 3', monthlyPrice: '70.00', sortOrder: 3 },
];

export async function resetTestDatabase() {
  await prisma.notificationPreference.deleteMany();
  await prisma.featureRequestVote.deleteMany();
  await prisma.featureRequest.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.job.deleteMany();
  await prisma.costingLabourLine.deleteMany();
  await prisma.costingConsumableLine.deleteMany();
  await prisma.costingTemplate.deleteMany();
  await prisma.printerMaintenanceLog.deleteMany();
  await prisma.printerPreset.deleteMany();
  await prisma.printer.deleteMany();
  await prisma.filament.deleteMany();
  await prisma.labourStep.deleteMany();
  await prisma.consumable.deleteMany();
  await prisma.invoiceLineItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.quoteLineItem.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.session.deleteMany();
  await prisma.tenantSequence.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.platformAdmin.deleteMany();
  await prisma.backlogItem.deleteMany();
  // Material is a global (non-tenant-scoped) model — see materials.test.ts
  // and the design spec's "Scope decision" section. Wiped here like every
  // other table so fixture rows created by one test don't leak into another.
  await prisma.material.deleteMany();
  // Plan used to be find-if-missing rather than deleted and recreated
  // like every other table above — meaning any test anywhere in the
  // suite that creates its own ad-hoc plan (for a Subscription fixture)
  // leaves it sitting there for the rest of the run, since nothing ever
  // wipes it. Two independent exact-plan-count assertions (in
  // billing.test.ts and public.test.ts) intermittently failed against
  // that accumulation depending on file execution order before this was
  // fixed to actually reset like the rest of this function's name promises.
  await prisma.plan.deleteMany();

  for (const plan of SEED_PLANS) {
    await prisma.plan.create({ data: plan });
  }
}

/**
 * Builds a minimal Express app wired with just cookie/json middleware and the
 * given resource router — enough to exercise a router's endpoints directly
 * without pulling in the full app (auth middleware, other routers, etc.).
 */
export function buildMinimalApp(router: Router) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(router);
  return app;
}

/**
 * Registers and logs in a tenant against the full app, then attaches an
 * active subscription so requests pass requireActiveSubscription checks.
 * Returns a supertest agent authenticated as that tenant.
 */
export async function loggedInAgent(
  app: ReturnType<typeof buildApp>,
  email = 'jane@acmeprints.co.za',
) {
  await request(app).post('/api/auth/register').send({
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email,
    password: 'correct horse battery staple',
  });
  const tenant = await prisma.tenant.findUnique({ where: { email } });
  await request(app).post('/api/auth/verify-email').send({ token: tenant?.verificationToken });

  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: 'correct horse battery staple' });

  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  await prisma.subscription.create({
    data: {
      tenantId: tenant!.id,
      planId: plan.id,
      status: 'active',
      paymentProvider: 'payfast',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  return agent;
}
