# Billing & Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every tenant picks a plan and sets up recurring payment (PayFast
or PayPal) after verifying their email, gets a 14-day trial, and the
provider auto-charges at day 14. A lapsed subscription makes the account
read-only rather than blocking login.

**Architecture:** Two new Prisma models (`Plan`, `Subscription`). A
provider-abstraction layer (`PaymentProvider` interface) with one adapter
per provider, each exported as a plain object so tests can `mock.method`
its calls without any real network access — the exact pattern
established for `mailer.ts` in the real-SMTP phase. A new
`requireActiveSubscription` middleware, self-filtering on HTTP method
(only blocks mutating requests), added to every existing resource
router. A hard gate on the frontend: no subscription record means no
access to the dashboard, redirected to plan selection instead.

**Tech Stack:** No new npm dependencies — both providers are called via
plain `fetch`, and PayFast's signature is plain Node `crypto` (MD5).

## Global Constraints

- Three plans, prices in the database (`Plan.monthlyPrice`), not code:
  Tier 1 — R25, Tier 2 — R45, Tier 3 — R70 (monthly). No usage-limit
  enforcement tied to tier in this phase — tiers are pricing/marketing
  only.
- Card captured at signup via each provider's own hosted checkout —
  Barkie's backend never receives or stores card data.
- `past_due` → `lapsed` after a 7-day grace window.
- `requireActiveSubscription` blocks only `POST`/`PATCH`/`DELETE` —
  `GET` is never blocked, so a lapsed tenant keeps read access to
  everything they already have.
- All new PayFast/PayPal env vars are **optional** (not `required()`),
  matching the `SMTP_*` pattern from the real-SMTP phase — unset in
  dev/test/CI, set only in the VPS production `.env`, collected directly
  from the user immediately before that deploy step, never earlier,
  never committed.
- Provider adapters are exported as plain objects (not raw named
  functions), for the same ESM-mockability reason `mailer.ts` is.
- No real network calls to PayFast or PayPal in any test — every
  adapter test mocks `fetch` (or the adapter's own exported methods)
  directly.

---

### Task 1: Schema — `Plan` and `Subscription` models, migration, seed

**Files:**
- Modify: `platform/api/prisma/schema.prisma`
- Create: `platform/api/prisma/seed.ts`
- Modify: `platform/api/package.json` (add `prisma.seed` config)
- Modify: `platform/api/src/db/scoped.ts`
- Test: `platform/api/tests/scoped-subscription.test.ts`

**Interfaces:**
- Produces: `Plan` and `Subscription` Prisma models. `scoped(tenantId)
  .subscription.get()`, `.create(data)`, `.updateStatus(status, extra?)`
  in `src/db/scoped.ts`.
- Consumes: nothing from earlier tasks (this is the first task).

- [ ] **Step 1: Add the two models to the schema**

In `platform/api/prisma/schema.prisma`, add `subscription
Subscription?` to the `Tenant` model's relations block (right after the
existing `invoiceLineItems InvoiceLineItem[]` line):

```prisma
  invoiceLineItems       InvoiceLineItem[]
  subscription           Subscription?
```

Then add these two new models at the end of the file:

```prisma
model Plan {
  id           String   @id @default(uuid())
  name         String
  monthlyPrice Decimal  @db.Decimal(8, 2)
  sortOrder    Int
  active       Boolean  @default(true)
  createdAt    DateTime @default(now()) @db.Timestamptz(3)

  subscriptions Subscription[]

  @@map("plans")
}

model Subscription {
  id                     String    @id @default(uuid())
  tenantId               String    @unique
  planId                 String
  status                 String
  paymentProvider        String
  providerSubscriptionId String?
  trialEndsAt            DateTime  @db.Timestamptz(3)
  currentPeriodEnd       DateTime? @db.Timestamptz(3)
  createdAt              DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt              DateTime  @updatedAt @db.Timestamptz(3)

  tenant Tenant @relation(fields: [tenantId], references: [id])
  plan   Plan   @relation(fields: [planId], references: [id])

  @@map("subscriptions")
}
```

- [ ] **Step 2: Create the migration**

Run:
```bash
cd platform/api
npx prisma migrate dev --name add_billing_plan_subscription
```
Expected: a new migration directory under `prisma/migrations/`, applied
to `barkie_dev` automatically.

- [ ] **Step 3: Add a seed script for the 3 plans**

Create `platform/api/prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PLANS = [
  { name: 'Tier 1', monthlyPrice: '25.00', sortOrder: 1 },
  { name: 'Tier 2', monthlyPrice: '45.00', sortOrder: 2 },
  { name: 'Tier 3', monthlyPrice: '70.00', sortOrder: 3 },
];

async function main() {
  for (const plan of PLANS) {
    const existing = await prisma.plan.findFirst({ where: { name: plan.name } });
    if (existing) {
      await prisma.plan.update({ where: { id: existing.id }, data: plan });
    } else {
      await prisma.plan.create({ data: plan });
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
```

In `platform/api/package.json`, add a top-level `"prisma"` config block
(as a sibling of `"scripts"`, `"dependencies"`, etc.):

```json
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  },
```

Run the seed against local dev and test databases:
```bash
npx prisma db seed
node --env-file=.env.test node_modules/prisma/build/index.js db seed
```
Expected: 3 `Plan` rows in both `barkie_dev` and `barkie_test`. The seed
is idempotent (upsert-by-name) — safe to re-run.

- [ ] **Step 4: Write the failing tests for `scoped().subscription`**

Create `platform/api/tests/scoped-subscription.test.ts`:

```typescript
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db/client.js';
import { tenantScope } from '../src/db/scoped.js';
import { resetTestDatabase } from './helpers/testApp.js';

beforeEach(resetTestDatabase);

async function makeTenant(email: string) {
  return prisma.tenant.create({
    data: {
      businessName: 'Acme Prints',
      contactName: 'Jane Doe',
      email,
      passwordHash: 'irrelevant-for-this-test',
    },
  });
}

test('subscription.get returns null when no subscription exists', async () => {
  const tenant = await makeTenant('jane@acmeprints.co.za');
  const scoped = tenantScope(tenant.id);
  const result = await scoped.subscription.get();
  assert.equal(result, null);
});

test('subscription.create + get round-trips, including the plan relation', async () => {
  const tenant = await makeTenant('jane@acmeprints.co.za');
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  const scoped = tenantScope(tenant.id);

  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  await scoped.subscription.create({
    planId: plan.id,
    status: 'trialing',
    paymentProvider: 'payfast',
    trialEndsAt,
  });

  const result = await scoped.subscription.get();
  assert.ok(result);
  assert.equal(result?.status, 'trialing');
  assert.equal(result?.plan.name, 'Tier 1');
});

test('subscription.updateStatus only affects the owning tenant', async () => {
  const tenantA = await makeTenant('jane@acmeprints.co.za');
  const tenantB = await makeTenant('sam@othershop.co.za');
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  await tenantScope(tenantA.id).subscription.create({
    planId: plan.id, status: 'trialing', paymentProvider: 'payfast', trialEndsAt,
  });
  await tenantScope(tenantB.id).subscription.create({
    planId: plan.id, status: 'trialing', paymentProvider: 'payfast', trialEndsAt,
  });

  await tenantScope(tenantA.id).subscription.updateStatus('active');

  const a = await tenantScope(tenantA.id).subscription.get();
  const b = await tenantScope(tenantB.id).subscription.get();
  assert.equal(a?.status, 'active');
  assert.equal(b?.status, 'trialing');
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `cd platform/api && npm test -- --test-name-pattern subscription`
Expected: FAIL — `scoped().subscription` doesn't exist yet.

- [ ] **Step 6: Add `subscription` to `scoped.ts`**

In `platform/api/src/db/scoped.ts`, add these two interfaces near the
other `Create*Input` interfaces (after `UpdateCompanyProfileInput`):

```typescript
export interface CreateSubscriptionInput {
  planId: string;
  status: string;
  paymentProvider: string;
  trialEndsAt: Date;
  providerSubscriptionId?: string;
  currentPeriodEnd?: Date;
}

export interface UpdateSubscriptionExtra {
  providerSubscriptionId?: string;
  currentPeriodEnd?: Date;
}
```

Then add a `subscription` group to the object returned by
`tenantScope(tenantId)`, alongside the existing `tenantSequences` group
(after its closing `},`, before the final closing `};`):

```typescript
    subscription: {
      get: () =>
        prisma.subscription.findUnique({ where: { tenantId }, include: { plan: true } }),

      create: (data: CreateSubscriptionInput) =>
        prisma.subscription.create({ data: { ...data, tenantId }, include: { plan: true } }),

      updateStatus: (status: string, extra?: UpdateSubscriptionExtra) =>
        prisma.subscription.updateMany({ where: { tenantId }, data: { status, ...extra } }),
    },
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd platform/api && npm test -- --test-name-pattern subscription`
Expected: PASS (3/3)

- [ ] **Step 8: Run the full suite and typecheck**

Run: `cd platform/api && npm test && npm run typecheck`
Expected: PASS, no regressions

- [ ] **Step 9: Commit**

```bash
cd platform/api
git add prisma/schema.prisma prisma/seed.ts prisma/migrations package.json src/db/scoped.ts tests/scoped-subscription.test.ts
git commit -m "Add Plan and Subscription models, seed the 3 tiers, scoped() subscription helpers"
```

---

### Task 2: PayFast provider adapter

**Files:**
- Create: `platform/api/src/billing/payfastProvider.ts`
- Modify: `platform/api/src/env.ts`
- Test: `platform/api/tests/payfastProvider.test.ts`

**Interfaces:**
- Produces: `payfastProvider: PaymentProvider` (see the shared interface
  below, defined inline in this file since Task 3's PayPal adapter needs
  the identical shape — both files independently declare the same
  interface rather than one importing from the other, keeping each
  provider file self-contained).
- Consumes: `env.payfastMerchantId`, `env.payfastMerchantKey`,
  `env.payfastPassphrase`, `env.paymentsLive` (all new, added in this
  task).

- [ ] **Step 1: Add PayFast env vars**

In `platform/api/src/env.ts`, add to the `env` object (after the
existing `smtpFromName` line):

```typescript
  // Payment provider credentials — optional, same pattern as SMTP_*:
  // unset in dev/test/CI, set only in the VPS production .env, collected
  // directly from the user immediately before that deploy step.
  paymentsLive: process.env.NODE_ENV === 'production',
  payfastMerchantId: process.env.PAYFAST_MERCHANT_ID,
  payfastMerchantKey: process.env.PAYFAST_MERCHANT_KEY,
  payfastPassphrase: process.env.PAYFAST_PASSPHRASE,
```

- [ ] **Step 2: Write the failing tests**

Create `platform/api/tests/payfastProvider.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createPayfastProvider } from '../src/billing/payfastProvider.js';

const config = {
  merchantId: '10000100',
  merchantKey: '46f0cd694581a',
  passphrase: 'jt7NOE43FZPn',
  live: false,
};

test('createSubscriptionCheckout builds a redirect URL with a correctly-signed query string', async () => {
  const provider = createPayfastProvider(config);
  const { redirectUrl } = await provider.createSubscriptionCheckout({
    tenantId: 't1',
    plan: { id: 'p1', name: 'Tier 1', monthlyPrice: '25.00' },
    trialDays: 14,
    returnUrl: 'https://barkie.co.za/app/billing/complete',
    webhookUrl: 'https://barkie.co.za/api/webhooks/payfast',
  });

  const url = new URL(redirectUrl);
  assert.equal(url.origin, 'https://sandbox.payfast.co.za');
  const params = url.searchParams;
  assert.equal(params.get('merchant_id'), '10000100');
  assert.equal(params.get('subscription_type'), '1');
  assert.equal(params.get('recurring_amount'), '25.00');
  assert.equal(params.get('frequency'), '3');
  assert.ok(params.get('billing_date'));
  assert.ok(params.get('signature'));

  // Recompute the signature the same way PayFast does — every non-blank
  // field except "signature", in the order they appear in the query
  // string, URL-encoded (space as "+"), joined with "&", passphrase
  // appended, MD5 hex digest.
  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === 'signature' || value === '') continue;
    pairs.push(`${key}=${encodeURIComponent(value).replace(/%20/g, '+')}`);
  }
  const expected = crypto
    .createHash('md5')
    .update(`${pairs.join('&')}&passphrase=${encodeURIComponent(config.passphrase).replace(/%20/g, '+')}`)
    .digest('hex');
  assert.equal(params.get('signature'), expected);
});

test('verifyWebhookSignature accepts a correctly-signed ITN payload and rejects a tampered one', () => {
  const provider = createPayfastProvider(config);
  const payload: Record<string, string> = {
    m_payment_id: 'sub_t1',
    pf_payment_id: '12345',
    payment_status: 'COMPLETE',
    amount_gross: '25.00',
  };
  const pairs = Object.entries(payload).map(
    ([key, value]) => `${key}=${encodeURIComponent(value).replace(/%20/g, '+')}`,
  );
  const signature = crypto
    .createHash('md5')
    .update(`${pairs.join('&')}&passphrase=${encodeURIComponent(config.passphrase).replace(/%20/g, '+')}`)
    .digest('hex');

  const goodReq = { body: { ...payload, signature } } as unknown as Request;
  assert.equal(provider.verifyWebhookSignature(goodReq), true);

  const tamperedReq = { body: { ...payload, amount_gross: '999.00', signature } } as unknown as Request;
  assert.equal(provider.verifyWebhookSignature(tamperedReq), false);
});

test('parseWebhookEvent normalizes a COMPLETE payment_status to "payment_succeeded"', () => {
  const provider = createPayfastProvider(config);
  const req = {
    body: { m_payment_id: 'sub_t1', payment_status: 'COMPLETE', token: 'pf-sub-abc123' },
  } as unknown as Request;
  const event = provider.parseWebhookEvent(req);
  assert.deepEqual(event, { providerSubscriptionId: 'pf-sub-abc123', type: 'payment_succeeded' });
});

test('parseWebhookEvent normalizes a FAILED payment_status to "payment_failed"', () => {
  const provider = createPayfastProvider(config);
  const req = {
    body: { m_payment_id: 'sub_t1', payment_status: 'FAILED', token: 'pf-sub-abc123' },
  } as unknown as Request;
  const event = provider.parseWebhookEvent(req);
  assert.deepEqual(event, { providerSubscriptionId: 'pf-sub-abc123', type: 'payment_failed' });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd platform/api && npm test -- --test-name-pattern payfast`
Expected: FAIL — `src/billing/payfastProvider.ts` doesn't exist yet.

- [ ] **Step 4: Implement the PayFast adapter**

Create `platform/api/src/billing/payfastProvider.ts`:

```typescript
import crypto from 'node:crypto';
import type { Request } from 'express';

export interface PaymentProvider {
  createSubscriptionCheckout(params: {
    tenantId: string;
    plan: { id: string; name: string; monthlyPrice: string };
    trialDays: number;
    returnUrl: string;
    webhookUrl: string;
  }): Promise<{ redirectUrl: string }>;
  verifyWebhookSignature(req: Request): boolean;
  parseWebhookEvent(req: Request): NormalizedSubscriptionEvent | null;
}

export interface NormalizedSubscriptionEvent {
  providerSubscriptionId: string;
  type: 'activated' | 'payment_succeeded' | 'payment_failed' | 'canceled';
}

interface PayfastConfig {
  merchantId: string;
  merchantKey: string;
  passphrase: string;
  live: boolean;
}

// PayFast requires values URL-encoded with spaces as "+" (application/x-www-form-urlencoded
// style), not "%20" — encodeURIComponent alone produces "%20", so this
// normalizes it the way PayFast's own signature examples do.
function payfastEncode(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, '+');
}

function buildSignature(fields: Record<string, string>, passphrase: string): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'signature' || value === '' || value === undefined) continue;
    pairs.push(`${key}=${payfastEncode(value)}`);
  }
  const paramString = `${pairs.join('&')}&passphrase=${payfastEncode(passphrase)}`;
  return crypto.createHash('md5').update(paramString).digest('hex');
}

export function createPayfastProvider(config: PayfastConfig): PaymentProvider {
  const baseUrl = config.live ? 'https://www.payfast.co.za' : 'https://sandbox.payfast.co.za';

  return {
    async createSubscriptionCheckout({ tenantId, plan, trialDays, returnUrl, webhookUrl }) {
      const billingDate = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
      const fields: Record<string, string> = {
        merchant_id: config.merchantId,
        merchant_key: config.merchantKey,
        return_url: returnUrl,
        cancel_url: returnUrl,
        notify_url: webhookUrl,
        m_payment_id: `sub_${tenantId}`,
        amount: plan.monthlyPrice,
        item_name: `Barkie subscription — ${plan.name}`,
        subscription_type: '1',
        billing_date: billingDate.toISOString().slice(0, 10),
        recurring_amount: plan.monthlyPrice,
        frequency: '3', // PayFast: 3 = monthly
        cycles: '0', // 0 = until cancelled
      };
      const signature = buildSignature(fields, config.passphrase);
      const query = new URLSearchParams({ ...fields, signature }).toString();
      return { redirectUrl: `${baseUrl}/eng/process?${query}` };
    },

    verifyWebhookSignature(req: Request): boolean {
      const body = req.body as Record<string, string>;
      const { signature, ...rest } = body;
      if (!signature) return false;
      return buildSignature(rest, config.passphrase) === signature;
    },

    parseWebhookEvent(req: Request): NormalizedSubscriptionEvent | null {
      const body = req.body as Record<string, string>;
      const providerSubscriptionId = body.token;
      if (!providerSubscriptionId) return null;
      if (body.payment_status === 'COMPLETE') {
        return { providerSubscriptionId, type: 'payment_succeeded' };
      }
      if (body.payment_status === 'FAILED') {
        return { providerSubscriptionId, type: 'payment_failed' };
      }
      if (body.payment_status === 'CANCELLED') {
        return { providerSubscriptionId, type: 'canceled' };
      }
      return null;
    },
  };
}

export const payfastProvider = createPayfastProvider({
  merchantId: process.env.PAYFAST_MERCHANT_ID ?? '',
  merchantKey: process.env.PAYFAST_MERCHANT_KEY ?? '',
  passphrase: process.env.PAYFAST_PASSPHRASE ?? '',
  live: process.env.NODE_ENV === 'production',
});
```

**Note for the implementer:** the exact PayFast ITN field name carrying
the recurring-billing subscription token (`token` above) and the exact
`payment_status` string values should be double-checked against
PayFast's real dashboard/sandbox output once real merchant credentials
are available (a later deploy step) — the values above are correct per
PayFast's published documentation as of this plan's writing, but ITN
payloads are worth one live sandbox test before this ships. Note this as
a concern in your report if you can't independently verify it from the
brief alone.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd platform/api && npm test -- --test-name-pattern payfast`
Expected: PASS (4/4)

- [ ] **Step 6: Run the full suite and typecheck**

Run: `cd platform/api && npm test && npm run typecheck`
Expected: PASS, no regressions

- [ ] **Step 7: Commit**

```bash
cd platform/api
git add src/env.ts src/billing/payfastProvider.ts tests/payfastProvider.test.ts
git commit -m "Add PayFast provider adapter (checkout, ITN signature verification, event parsing)"
```

---

### Task 3: PayPal provider adapter

**Files:**
- Create: `platform/api/src/billing/paypalProvider.ts`
- Modify: `platform/api/src/env.ts`
- Test: `platform/api/tests/paypalProvider.test.ts`

**Interfaces:**
- Produces: `paypalProvider: PaymentProvider` (same interface shape as
  Task 2's PayFast adapter, declared independently in this file).
- Consumes: `env.paypalClientId`, `env.paypalClientSecret`,
  `env.paypalWebhookId`, `env.paymentsLive` (the last one already added
  in Task 2).

- [ ] **Step 1: Add PayPal env vars**

In `platform/api/src/env.ts`, add right after the PayFast lines added in
Task 2:

```typescript
  paypalClientId: process.env.PAYPAL_CLIENT_ID,
  paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET,
  paypalWebhookId: process.env.PAYPAL_WEBHOOK_ID,
```

- [ ] **Step 2: Write the failing tests**

Create `platform/api/tests/paypalProvider.test.ts`:

```typescript
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createPaypalProvider } from '../src/billing/paypalProvider.js';

const config = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  webhookId: 'test-webhook-id',
  live: false,
};

test('createSubscriptionCheckout gets an access token, creates a plan and a subscription, and returns the approval link', async () => {
  const calls: Array<{ url: string; init: Record<string, unknown> }> = [];
  const fakeFetch = async (url: string, init: Record<string, unknown> = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/v1/oauth2/token')) {
      return { ok: true, json: async () => ({ access_token: 'fake-token' }) };
    }
    if (url.endsWith('/v1/catalogs/products')) {
      return { ok: true, json: async () => ({ id: 'PROD-1' }) };
    }
    if (url.endsWith('/v1/billing/plans')) {
      return { ok: true, json: async () => ({ id: 'PLAN-1' }) };
    }
    if (url.endsWith('/v1/billing/subscriptions')) {
      return {
        ok: true,
        json: async () => ({
          id: 'SUB-1',
          links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/approve/SUB-1' }],
        }),
      };
    }
    throw new Error(`Unexpected URL in test: ${url}`);
  };

  const provider = createPaypalProvider(config, fakeFetch as unknown as typeof fetch);
  const { redirectUrl } = await provider.createSubscriptionCheckout({
    tenantId: 't1',
    plan: { id: 'p1', name: 'Tier 1', monthlyPrice: '25.00' },
    trialDays: 14,
    returnUrl: 'https://barkie.co.za/app/billing/complete',
    webhookUrl: 'https://barkie.co.za/api/webhooks/paypal',
  });

  assert.equal(redirectUrl, 'https://www.sandbox.paypal.com/approve/SUB-1');
  assert.equal(calls.length, 4);
  const subscriptionCall = calls[3];
  const body = JSON.parse(subscriptionCall.init.body as string);
  assert.equal(body.plan_id, 'PLAN-1');
});

test('verifyWebhookSignature calls the verify-webhook-signature endpoint and returns true on SUCCESS', async () => {
  const fakeFetch = async (url: string) => {
    if (url.endsWith('/v1/oauth2/token')) {
      return { ok: true, json: async () => ({ access_token: 'fake-token' }) } as Response;
    }
    if (url.endsWith('/v1/notifications/verify-webhook-signature')) {
      return { ok: true, json: async () => ({ verification_status: 'SUCCESS' }) } as Response;
    }
    throw new Error(`Unexpected URL in test: ${url}`);
  };
  const provider = createPaypalProvider(config, fakeFetch as unknown as typeof fetch);

  const req = {
    headers: {
      'paypal-transmission-id': 'tid',
      'paypal-transmission-time': 'ttime',
      'paypal-transmission-sig': 'tsig',
      'paypal-cert-url': 'https://api.paypal.com/cert',
      'paypal-auth-algo': 'SHA256withRSA',
    },
    body: { id: 'WH-EVENT-1', event_type: 'PAYMENT.SALE.COMPLETED' },
  } as unknown as Request;

  const result = await provider.verifyWebhookSignature(req);
  assert.equal(result, true);
});

test('verifyWebhookSignature returns false on FAILURE', async () => {
  const fakeFetch = async (url: string) => {
    if (url.endsWith('/v1/oauth2/token')) {
      return { ok: true, json: async () => ({ access_token: 'fake-token' }) } as Response;
    }
    return { ok: true, json: async () => ({ verification_status: 'FAILURE' }) } as Response;
  };
  const provider = createPaypalProvider(config, fakeFetch as unknown as typeof fetch);
  const req = { headers: {}, body: {} } as unknown as Request;
  const result = await provider.verifyWebhookSignature(req);
  assert.equal(result, false);
});

test('parseWebhookEvent normalizes PAYMENT.SALE.COMPLETED to "payment_succeeded"', () => {
  const provider = createPaypalProvider(config, (async () => ({})) as unknown as typeof fetch);
  const req = {
    body: { event_type: 'PAYMENT.SALE.COMPLETED', resource: { billing_agreement_id: 'SUB-1' } },
  } as unknown as Request;
  const event = provider.parseWebhookEvent(req);
  assert.deepEqual(event, { providerSubscriptionId: 'SUB-1', type: 'payment_succeeded' });
});

test('parseWebhookEvent normalizes BILLING.SUBSCRIPTION.CANCELLED to "canceled"', () => {
  const provider = createPaypalProvider(config, (async () => ({})) as unknown as typeof fetch);
  const req = {
    body: { event_type: 'BILLING.SUBSCRIPTION.CANCELLED', resource: { id: 'SUB-1' } },
  } as unknown as Request;
  const event = provider.parseWebhookEvent(req);
  assert.deepEqual(event, { providerSubscriptionId: 'SUB-1', type: 'canceled' });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd platform/api && npm test -- --test-name-pattern paypal`
Expected: FAIL — `src/billing/paypalProvider.ts` doesn't exist yet.

- [ ] **Step 4: Implement the PayPal adapter**

Create `platform/api/src/billing/paypalProvider.ts`:

```typescript
import type { Request } from 'express';
import type { PaymentProvider, NormalizedSubscriptionEvent } from './payfastProvider.js';

interface PaypalConfig {
  clientId: string;
  clientSecret: string;
  webhookId: string;
  live: boolean;
}

export function createPaypalProvider(
  config: PaypalConfig,
  fetchImpl: typeof fetch = fetch,
): PaymentProvider {
  const baseUrl = config.live ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

  async function getAccessToken(): Promise<string> {
    const res = await fetchImpl(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const data = await res.json();
    return data.access_token;
  }

  return {
    async createSubscriptionCheckout({ tenantId, plan, trialDays, returnUrl, webhookUrl }) {
      const accessToken = await getAccessToken();
      const authHeaders = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      };

      const productRes = await fetchImpl(`${baseUrl}/v1/catalogs/products`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: `Barkie — ${plan.name}`,
          type: 'SERVICE',
          category: 'SOFTWARE',
        }),
      });
      const product = await productRes.json();

      const planRes = await fetchImpl(`${baseUrl}/v1/billing/plans`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          product_id: product.id,
          name: `Barkie — ${plan.name}`,
          billing_cycles: [
            {
              tenure_type: 'TRIAL',
              sequence: 1,
              total_cycles: 1,
              frequency: { interval_unit: 'DAY', interval_count: trialDays },
              pricing_scheme: { fixed_price: { value: '0', currency_code: 'ZAR' } },
            },
            {
              tenure_type: 'REGULAR',
              sequence: 2,
              total_cycles: 0,
              frequency: { interval_unit: 'MONTH', interval_count: 1 },
              pricing_scheme: { fixed_price: { value: plan.monthlyPrice, currency_code: 'ZAR' } },
            },
          ],
          payment_preferences: { auto_bill_outstanding: true },
        }),
      });
      const paypalPlan = await planRes.json();

      const subscriptionRes = await fetchImpl(`${baseUrl}/v1/billing/subscriptions`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          plan_id: paypalPlan.id,
          custom_id: tenantId,
          application_context: {
            return_url: returnUrl,
            cancel_url: returnUrl,
          },
        }),
      });
      const subscription = await subscriptionRes.json();
      const approveLink = subscription.links.find((link: { rel: string; href: string }) => link.rel === 'approve');

      return { redirectUrl: approveLink.href };
    },

    async verifyWebhookSignature(req: Request): Promise<boolean> {
      const accessToken = await getAccessToken();
      const res = await fetchImpl(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transmission_id: req.headers['paypal-transmission-id'],
          transmission_time: req.headers['paypal-transmission-time'],
          cert_url: req.headers['paypal-cert-url'],
          auth_algo: req.headers['paypal-auth-algo'],
          transmission_sig: req.headers['paypal-transmission-sig'],
          webhook_id: config.webhookId,
          webhook_event: req.body,
        }),
      });
      const data = await res.json();
      return data.verification_status === 'SUCCESS';
    },

    parseWebhookEvent(req: Request): NormalizedSubscriptionEvent | null {
      const body = req.body as { event_type: string; resource: Record<string, unknown> };
      const providerSubscriptionId =
        (body.resource?.billing_agreement_id as string | undefined) ??
        (body.resource?.id as string | undefined);
      if (!providerSubscriptionId) return null;

      switch (body.event_type) {
        case 'BILLING.SUBSCRIPTION.ACTIVATED':
          return { providerSubscriptionId, type: 'activated' };
        case 'PAYMENT.SALE.COMPLETED':
          return { providerSubscriptionId, type: 'payment_succeeded' };
        case 'PAYMENT.SALE.DENIED':
        case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
          return { providerSubscriptionId, type: 'payment_failed' };
        case 'BILLING.SUBSCRIPTION.CANCELLED':
          return { providerSubscriptionId, type: 'canceled' };
        default:
          return null;
      }
    },
  };
}

export const paypalProvider = createPaypalProvider({
  clientId: env.paypalClientId ?? '',
  clientSecret: env.paypalClientSecret ?? '',
  webhookId: env.paypalWebhookId ?? '',
  live: env.paymentsLive,
});
```

(Reads from `env.ts` rather than `process.env` directly — Task 2's
review caught the same anti-pattern in `payfastProvider.ts`'s singleton
and fixed it there; do the same here from the start rather than
replicating it. This needs `import { env } from '../env.js';` added to
this file's imports, alongside the existing `PaymentProvider`/
`NormalizedSubscriptionEvent` import from `./payfastProvider.js`.)

**Note for the implementer:** `PaymentProvider.verifyWebhookSignature`'s
return type differs between the two adapters — PayFast's is
synchronous (`boolean`), PayPal's is asynchronous (`Promise<boolean>`,
since it requires an API round-trip). Widen the shared interface (in
`payfastProvider.ts`, since that's where it's declared) to `boolean |
Promise<boolean>` so both adapters satisfy it, and `await` the result at
every call site regardless of which provider is in use (`await
Promise.resolve(provider.verifyWebhookSignature(req))` is the simplest
way to handle both synchronous and asynchronous results uniformly).

- [ ] **Step 5: Widen the shared interface for the async PayPal case**

In `platform/api/src/billing/payfastProvider.ts`, change:

```typescript
export interface PaymentProvider {
  createSubscriptionCheckout(params: {
    tenantId: string;
    plan: { id: string; name: string; monthlyPrice: string };
    trialDays: number;
    returnUrl: string;
    webhookUrl: string;
  }): Promise<{ redirectUrl: string }>;
  verifyWebhookSignature(req: Request): boolean;
  parseWebhookEvent(req: Request): NormalizedSubscriptionEvent | null;
}
```

to:

```typescript
export interface PaymentProvider {
  createSubscriptionCheckout(params: {
    tenantId: string;
    plan: { id: string; name: string; monthlyPrice: string };
    trialDays: number;
    returnUrl: string;
    webhookUrl: string;
  }): Promise<{ redirectUrl: string }>;
  verifyWebhookSignature(req: Request): boolean | Promise<boolean>;
  parseWebhookEvent(req: Request): NormalizedSubscriptionEvent | null;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd platform/api && npm test -- --test-name-pattern paypal`
Expected: PASS (5/5)

- [ ] **Step 7: Run the full suite and typecheck**

Run: `cd platform/api && npm test && npm run typecheck`
Expected: PASS, no regressions

- [ ] **Step 8: Commit**

```bash
cd platform/api
git add src/env.ts src/billing/payfastProvider.ts src/billing/paypalProvider.ts tests/paypalProvider.test.ts
git commit -m "Add PayPal provider adapter (checkout, webhook signature verification, event parsing)"
```

---

### Task 4: Billing routes + webhook routes

**Files:**
- Create: `platform/api/src/routes/billing.ts`
- Create: `platform/api/src/routes/webhooks.ts`
- Modify: `platform/api/src/app.ts`
- Test: `platform/api/tests/billing.test.ts`
- Test: `platform/api/tests/webhooks.test.ts`

**Interfaces:**
- Consumes: `payfastProvider`, `paypalProvider` (Tasks 2-3),
  `scoped().subscription` (Task 1), `prisma.plan`.
- Produces: `GET /api/plans`, `POST /api/billing/checkout`, `GET
  /api/billing/subscription`, `POST /api/billing/cancel`, `POST
  /api/webhooks/payfast`, `POST /api/webhooks/paypal`.

- [ ] **Step 1: Write the failing tests for the billing routes**

Create `platform/api/tests/billing.test.ts`:

```typescript
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';

beforeEach(resetTestDatabase);

async function loggedInAgent(app: ReturnType<typeof buildApp>, email = 'jane@acmeprints.co.za') {
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
  return agent;
}

test('GET /api/plans requires auth', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/plans');
  assert.equal(res.status, 401);
});

test('GET /api/plans lists the 3 seeded plans, ordered by sortOrder', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.get('/api/plans');
  assert.equal(res.status, 200);
  assert.equal(res.body.plans.length, 3);
  assert.deepEqual(
    res.body.plans.map((p: { name: string }) => p.name),
    ['Tier 1', 'Tier 2', 'Tier 3'],
  );
});

test('GET /api/billing/subscription returns null when the tenant has no subscription yet', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.get('/api/billing/subscription');
  assert.equal(res.status, 200);
  assert.equal(res.body.subscription, null);
});

test('POST /api/billing/checkout rejects an unknown provider', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  const res = await agent.post('/api/billing/checkout').send({ planId: plan.id, provider: 'not-a-real-provider' });
  assert.equal(res.status, 400);
});

test('POST /api/billing/checkout rejects an unknown planId', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/billing/checkout').send({ planId: 'does-not-exist', provider: 'payfast' });
  assert.equal(res.status, 400);
});
```

- [ ] **Step 2: Write the failing tests for the webhook routes**

Create `platform/api/tests/webhooks.test.ts`:

```typescript
import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';
import { payfastProvider } from '../src/billing/payfastProvider.js';

beforeEach(resetTestDatabase);

async function makeTrialingTenant(email: string) {
  const tenant = await prisma.tenant.create({
    data: { businessName: 'Acme Prints', contactName: 'Jane Doe', email, passwordHash: 'x' },
  });
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: plan.id,
      status: 'trialing',
      paymentProvider: 'payfast',
      providerSubscriptionId: 'pf-sub-1',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });
  return tenant;
}

test('POST /api/webhooks/payfast rejects a payload with an invalid signature', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/webhooks/payfast').send({
    token: 'pf-sub-1', payment_status: 'COMPLETE', signature: 'not-a-real-signature',
  });
  assert.equal(res.status, 400);
});

test('POST /api/webhooks/payfast updates the matching subscription to active on a valid COMPLETE event', async () => {
  await makeTrialingTenant('jane@acmeprints.co.za');
  mock.method(payfastProvider, 'verifyWebhookSignature', () => true);
  mock.method(payfastProvider, 'parseWebhookEvent', () => ({
    providerSubscriptionId: 'pf-sub-1',
    type: 'payment_succeeded',
  }));

  try {
    const app = buildApp();
    const res = await request(app).post('/api/webhooks/payfast').send({ token: 'pf-sub-1', payment_status: 'COMPLETE' });
    assert.equal(res.status, 200);

    const subscription = await prisma.subscription.findFirst({ where: { providerSubscriptionId: 'pf-sub-1' } });
    assert.equal(subscription?.status, 'active');
  } finally {
    mock.restoreAll();
  }
});

test('POST /api/webhooks/payfast marks the subscription past_due on a payment_failed event', async () => {
  await makeTrialingTenant('jane@acmeprints.co.za');
  mock.method(payfastProvider, 'verifyWebhookSignature', () => true);
  mock.method(payfastProvider, 'parseWebhookEvent', () => ({
    providerSubscriptionId: 'pf-sub-1',
    type: 'payment_failed',
  }));

  try {
    const app = buildApp();
    const res = await request(app).post('/api/webhooks/payfast').send({ token: 'pf-sub-1', payment_status: 'FAILED' });
    assert.equal(res.status, 200);

    const subscription = await prisma.subscription.findFirst({ where: { providerSubscriptionId: 'pf-sub-1' } });
    assert.equal(subscription?.status, 'past_due');
  } finally {
    mock.restoreAll();
  }
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd platform/api && npm test`
Expected: FAIL — none of these routes exist yet (404s throughout).

- [ ] **Step 4: Implement `src/routes/billing.ts`**

Create `platform/api/src/routes/billing.ts`:

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { tenantScope } from '../db/scoped.js';
import { prisma } from '../db/client.js';
import { env } from '../env.js';
import { payfastProvider } from '../billing/payfastProvider.js';
import { paypalProvider } from '../billing/paypalProvider.js';
import type { PaymentProvider } from '../billing/payfastProvider.js';

export const billingRouter = Router();
billingRouter.use(requireTenantAuth);

const TRIAL_DAYS = 14;

const providers: Record<string, PaymentProvider> = {
  payfast: payfastProvider,
  paypal: paypalProvider,
};

function serializePlan(plan: { id: string; name: string; monthlyPrice: unknown; sortOrder: number }) {
  return {
    id: plan.id,
    name: plan.name,
    monthlyPrice: (plan.monthlyPrice as { toFixed: (n: number) => string }).toFixed(2),
    sortOrder: plan.sortOrder,
  };
}

function serializeSubscription(
  subscription: {
    id: string;
    status: string;
    paymentProvider: string;
    trialEndsAt: Date;
    currentPeriodEnd: Date | null;
    plan: { id: string; name: string; monthlyPrice: unknown; sortOrder: number };
  } | null,
) {
  if (!subscription) return null;
  return {
    id: subscription.id,
    status: subscription.status,
    paymentProvider: subscription.paymentProvider,
    trialEndsAt: subscription.trialEndsAt,
    currentPeriodEnd: subscription.currentPeriodEnd,
    plan: serializePlan(subscription.plan),
  };
}

billingRouter.get('/api/plans', async (_req, res) => {
  const plans = await prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
  res.json({ ok: true, plans: plans.map(serializePlan) });
});

billingRouter.get('/api/billing/subscription', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const subscription = await scoped.subscription.get();
  res.json({ ok: true, subscription: serializeSubscription(subscription) });
});

const checkoutSchema = z.object({
  planId: z.string().min(1),
  provider: z.enum(['payfast', 'paypal']),
});

billingRouter.post('/api/billing/checkout', async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'A plan and a payment provider are required.' });
  }
  const { planId, provider: providerName } = parsed.data;

  const plan = await prisma.plan.findFirst({ where: { id: planId, active: true } });
  if (!plan) {
    return res.status(400).json({ ok: false, error: 'That plan is not available.' });
  }

  const scoped = tenantScope(req.tenantId!);
  const existing = await scoped.subscription.get();
  if (existing) {
    return res.status(400).json({ ok: false, error: 'You already have a subscription.' });
  }

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  await scoped.subscription.create({
    planId: plan.id,
    status: 'trialing',
    paymentProvider: providerName,
    trialEndsAt,
  });

  const provider = providers[providerName];
  const { redirectUrl } = await provider.createSubscriptionCheckout({
    tenantId: req.tenantId!,
    plan: { id: plan.id, name: plan.name, monthlyPrice: plan.monthlyPrice.toFixed(2) },
    trialDays: TRIAL_DAYS,
    returnUrl: `${env.frontendOrigin}${env.frontendBasePath}/billing/complete`,
    webhookUrl: `${env.frontendOrigin}/api/webhooks/${providerName}`,
  });

  res.json({ ok: true, redirectUrl });
});

billingRouter.post('/api/billing/cancel', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const subscription = await scoped.subscription.get();
  if (!subscription) {
    return res.status(400).json({ ok: false, error: 'No subscription to cancel.' });
  }
  await scoped.subscription.updateStatus('canceled');
  res.json({ ok: true });
});
```

`env.frontendOrigin` is the whole site's origin (`https://barkie.co.za`
in production), not a frontend-only value — it's the same env var
`sendVerificationEmail()` already uses to build a link at
`${env.frontendOrigin}${env.frontendBasePath}/verify-email`, and the API
is reachable at that same origin under `/api/` per nginx's path-based
routing (see `docs/AI_HANDOFF.md`'s "Deploying" section), so no new env
var is needed here.

- [ ] **Step 5: Implement `src/routes/webhooks.ts`**

Create `platform/api/src/routes/webhooks.ts`:

```typescript
import { Router } from 'express';
import { prisma } from '../db/client.js';
import { payfastProvider } from '../billing/payfastProvider.js';
import { paypalProvider } from '../billing/paypalProvider.js';
import type { PaymentProvider, NormalizedSubscriptionEvent } from '../billing/payfastProvider.js';

export const webhooksRouter = Router();

const GRACE_PERIOD_DAYS = 7;

async function applyEvent(event: NormalizedSubscriptionEvent): Promise<void> {
  const subscription = await prisma.subscription.findFirst({
    where: { providerSubscriptionId: event.providerSubscriptionId },
  });
  if (!subscription) return;

  if (event.type === 'activated' || event.type === 'payment_succeeded') {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'active', currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });
  } else if (event.type === 'payment_failed') {
    await prisma.subscription.update({ where: { id: subscription.id }, data: { status: 'past_due' } });
  } else if (event.type === 'canceled') {
    await prisma.subscription.update({ where: { id: subscription.id }, data: { status: 'canceled' } });
  }
}

function makeWebhookHandler(provider: PaymentProvider) {
  return async (req: import('express').Request, res: import('express').Response) => {
    const validSignature = await Promise.resolve(provider.verifyWebhookSignature(req));
    if (!validSignature) {
      return res.status(400).json({ ok: false, error: 'Invalid webhook signature.' });
    }
    const event = provider.parseWebhookEvent(req);
    if (event) {
      await applyEvent(event);
    }
    res.json({ ok: true });
  };
}

webhooksRouter.post('/api/webhooks/payfast', makeWebhookHandler(payfastProvider));
webhooksRouter.post('/api/webhooks/paypal', makeWebhookHandler(paypalProvider));
```

**Note for the implementer:** the 7-day grace-window → `lapsed`
transition (`GRACE_PERIOD_DAYS`) is declared but not yet used in this
brief's code — a `past_due` subscription needs a scheduled check to move
it to `lapsed` after 7 days, since there's no natural webhook event for
"still hasn't paid after N days." A simple, dependency-free approach:
check this opportunistically wherever a subscription's status is read
(e.g. in `requireActiveSubscription`, Task 5) — if `status === 'past_due'`
and `updatedAt` is more than 7 days ago, treat it as effectively lapsed
for that request (and optionally persist the transition at that point).
Implement this as part of Task 5's middleware rather than here, since
that's where subscription status actually gets checked; note in this
task's report that `GRACE_PERIOD_DAYS` here is currently unused and
flag it for Task 5 to consume.

- [ ] **Step 6: Wire both routers into `app.ts`**

In `platform/api/src/app.ts`, add two imports after the existing
`import { invoicesRouter } from './routes/invoices.js';` line:

```typescript
import { billingRouter } from './routes/billing.js';
import { webhooksRouter } from './routes/webhooks.js';
```

Then add both routers after the existing `app.use(invoicesRouter);`
line, before the error-handling middleware:

```typescript
  app.use(invoicesRouter);
  app.use(billingRouter);
  app.use(webhooksRouter);
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd platform/api && npm test`
Expected: PASS, all tests including the new billing/webhook ones.

- [ ] **Step 8: Typecheck**

Run: `cd platform/api && npm run typecheck`
Expected: no errors

- [ ] **Step 9: Commit**

```bash
cd platform/api
git add src/routes/billing.ts src/routes/webhooks.ts src/app.ts tests/billing.test.ts tests/webhooks.test.ts
git commit -m "Add billing (plans/checkout/subscription/cancel) and webhook (payfast/paypal) routes"
```

---

### Task 5: `requireActiveSubscription` middleware, wired into every resource router; extend `/api/auth/me`

**Files:**
- Create: `platform/api/src/middleware/requireActiveSubscription.ts`
- Modify: `platform/api/src/routes/customers.ts`
- Modify: `platform/api/src/routes/printers.ts`
- Modify: `platform/api/src/routes/printer-presets.ts`
- Modify: `platform/api/src/routes/printer-maintenance.ts`
- Modify: `platform/api/src/routes/filaments.ts`
- Modify: `platform/api/src/routes/labour-steps.ts`
- Modify: `platform/api/src/routes/consumables.ts`
- Modify: `platform/api/src/routes/costing-templates.ts`
- Modify: `platform/api/src/routes/company-profile.ts`
- Modify: `platform/api/src/routes/quotes.ts`
- Modify: `platform/api/src/routes/invoices.ts`
- Modify: `platform/api/src/routes/auth.ts`
- Test: `platform/api/tests/requireActiveSubscription.test.ts`
- Test: `platform/api/tests/auth.test.ts`

**Interfaces:**
- Produces: `requireActiveSubscription(req, res, next)` — an Express
  middleware, exported from `src/middleware/requireActiveSubscription.ts`.
- Consumes: `req.tenantId` (set by `requireTenantAuth`, which must run
  first), `scoped().subscription.get()` (Task 1).

- [ ] **Step 1: Write the failing tests for the middleware itself**

Create `platform/api/tests/requireActiveSubscription.test.ts`:

```typescript
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { prisma } from '../src/db/client.js';
import { tenantScope } from '../src/db/scoped.js';
import { requireActiveSubscription } from '../src/middleware/requireActiveSubscription.js';
import { resetTestDatabase } from './helpers/testApp.js';

beforeEach(resetTestDatabase);

function buildTestApp(tenantId: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenantId = tenantId;
    next();
  });
  app.use(requireActiveSubscription);
  app.get('/thing', (_req, res) => res.json({ ok: true }));
  app.post('/thing', (_req, res) => res.json({ ok: true }));
  return app;
}

async function makeTenantWithSubscriptionStatus(status: string, updatedAt?: Date) {
  const tenant = await prisma.tenant.create({
    data: { businessName: 'Acme Prints', contactName: 'Jane Doe', email: `${status}@acmeprints.co.za`, passwordHash: 'x' },
  });
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  const subscription = await tenantScope(tenant.id).subscription.create({
    planId: plan.id,
    status,
    paymentProvider: 'payfast',
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  });
  if (updatedAt) {
    await prisma.subscription.update({ where: { id: subscription.id }, data: { updatedAt } });
  }
  return tenant;
}

test('a trialing subscription is not blocked from POST', async () => {
  const tenant = await makeTenantWithSubscriptionStatus('trialing');
  const app = buildTestApp(tenant.id);
  const res = await request(app).post('/thing');
  assert.equal(res.status, 200);
});

test('an active subscription is not blocked from POST', async () => {
  const tenant = await makeTenantWithSubscriptionStatus('active');
  const app = buildTestApp(tenant.id);
  const res = await request(app).post('/thing');
  assert.equal(res.status, 200);
});

test('a lapsed subscription is blocked from POST with 402', async () => {
  const tenant = await makeTenantWithSubscriptionStatus('lapsed');
  const app = buildTestApp(tenant.id);
  const res = await request(app).post('/thing');
  assert.equal(res.status, 402);
});

test('a lapsed subscription is NOT blocked from GET', async () => {
  const tenant = await makeTenantWithSubscriptionStatus('lapsed');
  const app = buildTestApp(tenant.id);
  const res = await request(app).get('/thing');
  assert.equal(res.status, 200);
});

test('a past_due subscription still within the 7-day grace window is not blocked', async () => {
  const tenant = await makeTenantWithSubscriptionStatus('past_due', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));
  const app = buildTestApp(tenant.id);
  const res = await request(app).post('/thing');
  assert.equal(res.status, 200);
});

test('a past_due subscription past the 7-day grace window is blocked, treated as lapsed', async () => {
  const tenant = await makeTenantWithSubscriptionStatus('past_due', new Date(Date.now() - 8 * 24 * 60 * 60 * 1000));
  const app = buildTestApp(tenant.id);
  const res = await request(app).post('/thing');
  assert.equal(res.status, 402);
});

test('a tenant with no subscription at all is blocked from POST', async () => {
  const tenant = await prisma.tenant.create({
    data: { businessName: 'Acme Prints', contactName: 'Jane Doe', email: 'nosub@acmeprints.co.za', passwordHash: 'x' },
  });
  const app = buildTestApp(tenant.id);
  const res = await request(app).post('/thing');
  assert.equal(res.status, 402);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd platform/api && npm test -- --test-name-pattern requireActiveSubscription`
Expected: FAIL — the middleware doesn't exist yet.

- [ ] **Step 3: Implement the middleware**

Create `platform/api/src/middleware/requireActiveSubscription.ts`:

```typescript
import type { Request, Response, NextFunction } from 'express';
import { tenantScope } from '../db/scoped.js';

const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET') {
    return next();
  }

  const scoped = tenantScope(req.tenantId!);
  const subscription = await scoped.subscription.get();

  if (!subscription) {
    return res.status(402).json({ ok: false, error: 'Start a subscription to continue.' });
  }

  if (subscription.status === 'trialing' || subscription.status === 'active') {
    return next();
  }

  if (subscription.status === 'past_due') {
    const withinGrace = Date.now() - subscription.updatedAt.getTime() < GRACE_PERIOD_MS;
    if (withinGrace) {
      return next();
    }
  }

  return res.status(402).json({ ok: false, error: 'Your subscription has lapsed. Update your payment method to continue.' });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd platform/api && npm test -- --test-name-pattern requireActiveSubscription`
Expected: PASS (7/7)

- [ ] **Step 5: Wire the middleware into `customers.ts`**

In `platform/api/src/routes/customers.ts`, change:

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { tenantScope } from '../db/scoped.js';

export const customersRouter = Router();
customersRouter.use(requireTenantAuth);
```

to:

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { tenantScope } from '../db/scoped.js';

export const customersRouter = Router();
customersRouter.use(requireTenantAuth);
customersRouter.use(requireActiveSubscription);
```

- [ ] **Step 6: Repeat Step 5's exact pattern for the other 10 routers**

Each of these files has the identical two-line shape (`import {
requireTenantAuth } ...` and `<routerName>.use(requireTenantAuth);`) —
add the same `import { requireActiveSubscription } from
'../middleware/requireActiveSubscription.js';` import line and the same
`<routerName>.use(requireActiveSubscription);` line immediately after
its existing `requireTenantAuth` import/use, in each of:

- `platform/api/src/routes/printers.ts` (`printersRouter`)
- `platform/api/src/routes/printer-presets.ts` (`printerPresetsRouter`)
- `platform/api/src/routes/printer-maintenance.ts` (`printerMaintenanceRouter`)
- `platform/api/src/routes/filaments.ts` (`filamentsRouter`)
- `platform/api/src/routes/labour-steps.ts` (`labourStepsRouter`)
- `platform/api/src/routes/consumables.ts` (`consumablesRouter`)
- `platform/api/src/routes/costing-templates.ts` (`costingTemplatesRouter`)
- `platform/api/src/routes/company-profile.ts` (`companyProfileRouter`)
- `platform/api/src/routes/quotes.ts` (`quotesRouter`)
- `platform/api/src/routes/invoices.ts` (`invoicesRouter`)

Read each file's existing top-of-file import block and
`<router>.use(requireTenantAuth);` line before editing to confirm it
matches this pattern exactly (it does, per this plan's own verification
against the current codebase, but confirm rather than assume) — if any
file's structure genuinely differs, stop and ask rather than guessing.
Do NOT add this middleware to `billingRouter` or `webhooksRouter`
(Task 4) — a tenant must be able to start a subscription precisely when
they don't have an active one yet, and webhooks aren't tenant-session
requests at all.

- [ ] **Step 7: Extend `GET /api/auth/me` to include subscription status**

In `platform/api/src/routes/auth.ts`, add this import near the top
(alongside the existing imports):

```typescript
import { tenantScope } from '../db/scoped.js';
```

Then change the `GET /api/auth/me` handler from:

```typescript
  authRouter.get('/api/auth/me', requireTenantAuth, async (req, res) => {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId } });
    if (!tenant) {
      return res.status(401).json({ ok: false, error: 'Log in to continue.' });
    }
    res.json({
      ok: true,
      tenant: {
        id: tenant.id,
        businessName: tenant.businessName,
        email: tenant.email,
        emailVerified: tenant.emailVerifiedAt !== null,
      },
    });
  });
```

to:

```typescript
  authRouter.get('/api/auth/me', requireTenantAuth, async (req, res) => {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId } });
    if (!tenant) {
      return res.status(401).json({ ok: false, error: 'Log in to continue.' });
    }
    const subscription = await tenantScope(tenant.id).subscription.get();
    res.json({
      ok: true,
      tenant: {
        id: tenant.id,
        businessName: tenant.businessName,
        email: tenant.email,
        emailVerified: tenant.emailVerifiedAt !== null,
        hasSubscription: subscription !== null,
      },
    });
  });
```

- [ ] **Step 8: Write the failing test for the `/api/auth/me` extension**

Add this test to `platform/api/tests/auth.test.ts`, near the other
`/api/auth/me`-adjacent tests (search the file for any existing `/api/auth/me`
coverage first — if none exists, add near the end of the file):

```typescript
test('GET /api/auth/me reports hasSubscription: false for a tenant with no subscription yet', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.get('/api/auth/me');
  assert.equal(res.status, 200);
  assert.equal(res.body.tenant.hasSubscription, false);
});
```

(This file already has a `loggedInAgent` helper at the top — reuse it,
don't redefine it.)

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd platform/api && npm test`
Expected: PASS, all tests including the new middleware and auth.me ones.

- [ ] **Step 10: Typecheck**

Run: `cd platform/api && npm run typecheck`
Expected: no errors

- [ ] **Step 11: Commit**

```bash
cd platform/api
git add src/middleware/requireActiveSubscription.ts src/routes/customers.ts src/routes/printers.ts src/routes/printer-presets.ts src/routes/printer-maintenance.ts src/routes/filaments.ts src/routes/labour-steps.ts src/routes/consumables.ts src/routes/costing-templates.ts src/routes/company-profile.ts src/routes/quotes.ts src/routes/invoices.ts src/routes/auth.ts tests/requireActiveSubscription.test.ts tests/auth.test.ts
git commit -m "Add requireActiveSubscription middleware (read-only on lapsed), wire into every resource router; expose hasSubscription on /api/auth/me"
```

---

### Task 6: Frontend — plan selection, checkout redirect, billing API hooks

**Files:**
- Create: `platform/frontend/src/api/billing.ts`
- Create: `platform/frontend/src/pages/billing/PlanSelectionPage.tsx`
- Create: `platform/frontend/src/pages/billing/BillingCompletePage.tsx`
- Modify: `platform/frontend/src/App.tsx`
- Test: `platform/frontend/tests/PlanSelectionPage.test.tsx`
- Test: `platform/frontend/tests/BillingCompletePage.test.tsx`

**Interfaces:**
- Produces: `usePlans()`, `useSubscription()`, `useCheckout()`,
  `useCancelSubscription()` react-query hooks from
  `src/api/billing.ts`, following the exact same
  `apiGet`/`apiPost`/`useQuery`/`useMutation` pattern as every other
  `src/api/*.ts` module in this codebase.
- Consumes: `apiGet`, `apiPost`, `ApiError` from `src/api/client.js`
  (unchanged).

- [ ] **Step 1: Write the failing tests for `PlanSelectionPage`**

Create `platform/frontend/tests/PlanSelectionPage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { PlanSelectionPage } from '../src/pages/billing/PlanSelectionPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

const plans = [
  { id: 'p1', name: 'Tier 1', monthlyPrice: '25.00', sortOrder: 1 },
  { id: 'p2', name: 'Tier 2', monthlyPrice: '45.00', sortOrder: 2 },
  { id: 'p3', name: 'Tier 3', monthlyPrice: '70.00', sortOrder: 3 },
];

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <PlanSelectionPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('PlanSelectionPage', () => {
  it('renders all 3 plans with their prices', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, plans });
    renderPage();
    await waitFor(() => expect(screen.getByText('Tier 1')).toBeInTheDocument());
    expect(screen.getByText('Tier 2')).toBeInTheDocument();
    expect(screen.getByText('Tier 3')).toBeInTheDocument();
    expect(screen.getByText(/25\.00/)).toBeInTheDocument();
  });

  it('lets the tenant pick a plan and a provider, and redirects the browser on checkout', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, plans });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ redirectUrl: 'https://sandbox.payfast.co.za/eng/process?x=1' });

    const originalLocation = window.location;
    // @ts-expect-error -- test-only override to observe the redirect
    delete window.location;
    // @ts-expect-error -- test-only override
    window.location = { ...originalLocation, href: '' };

    renderPage();
    await waitFor(() => expect(screen.getByText('Tier 1')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: /start free trial/i })[0]);

    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/api/billing/checkout', { planId: 'p1', provider: 'payfast' }));
    await waitFor(() => expect(window.location.href).toBe('https://sandbox.payfast.co.za/eng/process?x=1'));

    // @ts-expect-error -- restore
    window.location = originalLocation;
  });
});
```

- [ ] **Step 2: Write the failing test for `BillingCompletePage`**

Create `platform/frontend/tests/BillingCompletePage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { BillingCompletePage } from '../src/pages/billing/BillingCompletePage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter initialEntries={['/billing/complete']}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/billing/complete" element={<BillingCompletePage />} />
          <Route path="/" element={<div>dashboard</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('BillingCompletePage', () => {
  it('shows a confirmation once the subscription is active', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      subscription: { id: 's1', status: 'trialing', paymentProvider: 'payfast', trialEndsAt: '2026-09-22T00:00:00.000Z', currentPeriodEnd: null, plan: { id: 'p1', name: 'Tier 1', monthlyPrice: '25.00', sortOrder: 1 } },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText(/trial/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd platform/frontend && npm test -- PlanSelectionPage BillingCompletePage`
Expected: FAIL — neither page exists yet.

- [ ] **Step 4: Implement `src/api/billing.ts`**

Create `platform/frontend/src/api/billing.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from './client.js';

export interface Plan {
  id: string;
  name: string;
  monthlyPrice: string;
  sortOrder: number;
}

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'lapsed' | 'canceled';

export interface Subscription {
  id: string;
  status: SubscriptionStatus;
  paymentProvider: 'payfast' | 'paypal';
  trialEndsAt: string;
  currentPeriodEnd: string | null;
  plan: Plan;
}

const SUBSCRIPTION_QUERY_KEY = ['billing', 'subscription'] as const;

export function usePlans() {
  return useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: () => apiGet<{ plans: Plan[] }>('/api/plans').then((r) => r.plans),
  });
}

export function useSubscription() {
  return useQuery({
    queryKey: SUBSCRIPTION_QUERY_KEY,
    queryFn: () => apiGet<{ subscription: Subscription | null }>('/api/billing/subscription').then((r) => r.subscription),
  });
}

export function useCheckout() {
  return useMutation({
    mutationFn: (data: { planId: string; provider: 'payfast' | 'paypal' }) =>
      apiPost<{ redirectUrl: string }>('/api/billing/checkout', data).then((r) => r.redirectUrl),
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost('/api/billing/cancel'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY });
    },
  });
}
```

- [ ] **Step 5: Implement `PlanSelectionPage.tsx`**

Create `platform/frontend/src/pages/billing/PlanSelectionPage.tsx`:

```typescript
import { useState } from 'react';
import { usePlans, useCheckout, type Plan } from '../../api/billing.js';
import { ApiError } from '../../api/client.js';

type Provider = 'payfast' | 'paypal';

export function PlanSelectionPage() {
  const { data: plans, isLoading, isError } = usePlans();
  const checkoutMutation = useCheckout();
  const [selectedProvider, setSelectedProvider] = useState<Provider>('payfast');
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (isError || !plans) {
    return <p className="text-red-600">Couldn't load plans.</p>;
  }

  async function handleStart(plan: Plan) {
    setError(null);
    try {
      const redirectUrl = await checkoutMutation.mutateAsync({ planId: plan.id, provider: selectedProvider });
      window.location.href = redirectUrl;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center gap-8 bg-slate-50 p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Choose a plan</h1>

      <div className="flex gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="provider"
            checked={selectedProvider === 'payfast'}
            onChange={() => setSelectedProvider('payfast')}
          />
          PayFast
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="provider"
            checked={selectedProvider === 'paypal'}
            onChange={() => setSelectedProvider('paypal')}
          />
          PayPal
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div key={plan.id} className="flex w-64 flex-col gap-3 rounded-lg bg-white p-6 shadow">
            <h2 className="text-lg font-semibold text-slate-900">{plan.name}</h2>
            <p className="text-2xl font-bold text-slate-900">R {plan.monthlyPrice}<span className="text-sm font-normal text-slate-500">/mo</span></p>
            <p className="text-sm text-slate-500">14-day free trial</p>
            <button
              onClick={() => handleStart(plan)}
              disabled={checkoutMutation.isPending}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Start free trial
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Implement `BillingCompletePage.tsx`**

Create `platform/frontend/src/pages/billing/BillingCompletePage.tsx`:

```typescript
import { Link } from 'react-router-dom';
import { useSubscription } from '../../api/billing.js';

export function BillingCompletePage() {
  const { data: subscription, isLoading, isError } = useSubscription();

  if (isLoading) {
    return <p className="text-slate-500">Confirming your subscription…</p>;
  }
  if (isError || !subscription) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-red-600">We couldn't confirm your subscription yet. It may take a moment for the payment provider to notify us.</p>
        <Link to="/" className="text-sm text-slate-500 underline">Go to dashboard</Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-semibold text-slate-900">You're all set</h1>
      <p className="text-slate-600">
        {subscription.status === 'trialing'
          ? `Your 14-day free trial on ${subscription.plan.name} has started.`
          : `Your ${subscription.plan.name} subscription is active.`}
      </p>
      <Link to="/" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">Go to dashboard</Link>
    </div>
  );
}
```

- [ ] **Step 7: Add both routes to `App.tsx`**

In `platform/frontend/src/App.tsx`, add two imports after the existing
`import { NotFoundPage } from './pages/NotFoundPage.js';` line:

```typescript
import { PlanSelectionPage } from './pages/billing/PlanSelectionPage.js';
import { BillingCompletePage } from './pages/billing/BillingCompletePage.js';
```

Then add two routes, right before the final `<Route path="*" ...>` line:

```typescript
        <Route
          path="/plans"
          element={
            <RequireAuth>
              <PlanSelectionPage />
            </RequireAuth>
          }
        />
        <Route
          path="/billing/complete"
          element={
            <RequireAuth>
              <BillingCompletePage />
            </RequireAuth>
          }
        />
```

(Deliberately NOT wrapped in `<AppShell>` — a tenant on these pages
doesn't have an active subscription yet, so the normal nav/dashboard
chrome doesn't apply.)

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd platform/frontend && npm test -- PlanSelectionPage BillingCompletePage`
Expected: PASS, all tests including the new ones.

- [ ] **Step 9: Run the full frontend test suite**

Run: `cd platform/frontend && npm test`
Expected: PASS, no regressions.

- [ ] **Step 10: Typecheck / build**

Run: `cd platform/frontend && npm run build`
Expected: no type errors, build succeeds.

- [ ] **Step 11: Commit**

```bash
cd platform/frontend
git add src/api/billing.ts src/pages/billing/PlanSelectionPage.tsx src/pages/billing/BillingCompletePage.tsx src/App.tsx tests/PlanSelectionPage.test.tsx tests/BillingCompletePage.test.tsx
git commit -m "Add plan selection and billing-complete pages, billing API hooks"
```

---

### Task 7: Frontend — subscription gate, trial/status banner, billing settings

**Files:**
- Modify: `platform/frontend/src/context/AuthContext.tsx`
- Modify: `platform/frontend/src/components/AppShell.tsx`
- Create: `platform/frontend/src/pages/billing/BillingSettingsPage.tsx`
- Modify: `platform/frontend/src/App.tsx`
- Test: `platform/frontend/tests/AuthContext.test.tsx` (check if this
  file exists first — if not, add the new test case to whichever
  existing test file already covers `RequireAuth`, e.g. a routing test
  in `App.test.tsx`)
- Test: `platform/frontend/tests/BillingSettingsPage.test.tsx`

**Interfaces:**
- Consumes: `useSubscription()` (Task 6), `Tenant.hasSubscription:
  boolean` (Task 5's backend change to `/api/auth/me`, already reflected
  in this task's `Tenant` interface update).

- [ ] **Step 1: Write the failing test for the subscription gate**

First, locate the existing test coverage for `RequireAuth`'s redirect
behavior — check `platform/frontend/tests/App.test.tsx` for a test like
"redirects to /login when not authenticated" as a model for the pattern.
Add a new test alongside it:

```typescript
it('redirects an authenticated tenant with no subscription to /plans', async () => {
  vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === '/api/auth/me') {
      return Promise.resolve({
        ok: true,
        tenant: { id: 't1', businessName: 'Acme Prints', email: 'jane@acmeprints.co.za', emailVerified: true, hasSubscription: false },
      });
    }
    return Promise.reject(new client.ApiError('not found', 404));
  });

  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );

  await waitFor(() => expect(screen.getByText('Choose a plan')).toBeInTheDocument());
});
```

(Match this test's exact imports/render setup to whatever pattern
`App.test.tsx` already establishes — don't guess at import paths; read
the file first.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd platform/frontend && npm test -- App`
Expected: FAIL — no such redirect exists yet.

- [ ] **Step 3: Extend `Tenant` and add the gate in `AuthContext.tsx`**

In `platform/frontend/src/context/AuthContext.tsx`, change the `Tenant`
interface from:

```typescript
export interface Tenant {
  id: string;
  businessName: string;
  email: string;
  emailVerified: boolean;
}
```

to:

```typescript
export interface Tenant {
  id: string;
  businessName: string;
  email: string;
  emailVerified: boolean;
  hasSubscription: boolean;
}
```

Then change `RequireAuth` from:

```typescript
export function RequireAuth({ children }: { children: ReactNode }) {
  const { tenant, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>;
  }
  if (!tenant) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}
```

to:

```typescript
export function RequireAuth({ children }: { children: ReactNode }) {
  const { tenant, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>;
  }
  if (!tenant) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  // A tenant with no subscription at all must pick a plan before doing
  // anything else — but the plan-selection and billing-complete pages
  // are themselves wrapped in RequireAuth (Task 6), so this check must
  // not redirect a tenant who is ALREADY on one of those two pages,
  // or picking a plan would infinite-loop back to itself.
  if (!tenant.hasSubscription && location.pathname !== '/plans' && location.pathname !== '/billing/complete') {
    return <Navigate to="/plans" replace />;
  }
  return <>{children}</>;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd platform/frontend && npm test -- App`
Expected: PASS

- [ ] **Step 5: Write the failing test for `BillingSettingsPage`**

Create `platform/frontend/tests/BillingSettingsPage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { BillingSettingsPage } from '../src/pages/billing/BillingSettingsPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

const activeSubscription = {
  id: 's1', status: 'active', paymentProvider: 'payfast',
  trialEndsAt: '2026-09-22T00:00:00.000Z', currentPeriodEnd: '2026-10-22T00:00:00.000Z',
  plan: { id: 'p1', name: 'Tier 1', monthlyPrice: '25.00', sortOrder: 1 },
};

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <BillingSettingsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('BillingSettingsPage', () => {
  it('shows the current plan and status', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, subscription: activeSubscription });
    renderPage();
    await waitFor(() => expect(screen.getByText('Tier 1')).toBeInTheDocument());
    expect(screen.getByText(/active/i)).toBeInTheDocument();
  });

  it('cancels the subscription when the cancel button is clicked', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, subscription: activeSubscription });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true });
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /cancel subscription/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /cancel subscription/i }));
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/api/billing/cancel'));
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd platform/frontend && npm test -- BillingSettingsPage`
Expected: FAIL — the page doesn't exist yet.

- [ ] **Step 7: Implement `BillingSettingsPage.tsx`**

Create `platform/frontend/src/pages/billing/BillingSettingsPage.tsx`:

```typescript
import { useSubscription, useCancelSubscription } from '../../api/billing.js';

const STATUS_LABELS: Record<string, string> = {
  trialing: 'Trial',
  active: 'Active',
  past_due: 'Payment past due',
  lapsed: 'Lapsed',
  canceled: 'Canceled',
};

export function BillingSettingsPage() {
  const { data: subscription, isLoading, isError } = useSubscription();
  const cancelMutation = useCancelSubscription();

  if (isLoading) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (isError || !subscription) {
    return <p className="text-red-600">Couldn't load your subscription.</p>;
  }

  return (
    <div className="flex max-w-md flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900">Billing</h1>
      <div className="rounded-lg bg-white p-4 shadow">
        <div className="text-lg font-medium text-slate-900">{subscription.plan.name}</div>
        <div className="text-sm text-slate-500">R {subscription.plan.monthlyPrice}/mo</div>
        <div className="mt-2 text-sm">{STATUS_LABELS[subscription.status] ?? subscription.status}</div>
      </div>
      {subscription.status !== 'canceled' && (
        <button
          onClick={() => cancelMutation.mutate()}
          disabled={cancelMutation.isPending}
          className="rounded bg-slate-100 px-4 py-2 text-sm text-slate-700 disabled:opacity-50"
        >
          Cancel subscription
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Add the route and nav link**

In `platform/frontend/src/App.tsx`, add an import after the
`BillingCompletePage` import (added in Task 6):

```typescript
import { BillingSettingsPage } from './pages/billing/BillingSettingsPage.js';
```

Add a route right after the `/company-profile` route:

```typescript
        <Route
          path="/billing"
          element={
            <RequireAuth>
              <AppShell>
                <BillingSettingsPage />
              </AppShell>
            </RequireAuth>
          }
        />
```

In `platform/frontend/src/components/AppShell.tsx`, add a nav entry to
`NAV_ITEMS` (after `{ to: '/company-profile', label: 'Company Profile' },`):

```typescript
  { to: '/billing', label: 'Billing' },
```

- [ ] **Step 9: Add a trial/status banner to `AppShell.tsx`**

In `platform/frontend/src/components/AppShell.tsx`, add this import at
the top:

```typescript
import { useSubscription } from '../api/billing.js';
```

Add the hook call inside the `AppShell` function body, right after `const
{ tenant, refetch } = useAuth();`:

```typescript
  const { data: subscription } = useSubscription();
```

Then add a banner right after the opening `<div className="flex flex-1
flex-col">` element's `<header>` block (i.e. between the closing `</header>`
tag and the `<main>` tag):

```typescript
        {subscription?.status === 'trialing' && (
          <div className="bg-slate-100 px-6 py-2 text-center text-sm text-slate-700">
            {Math.max(0, Math.ceil((new Date(subscription.trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))} days left in your free trial
          </div>
        )}
        {(subscription?.status === 'past_due' || subscription?.status === 'lapsed') && (
          <div className="bg-red-50 px-6 py-2 text-center text-sm text-red-700">
            {subscription.status === 'lapsed'
              ? 'Your subscription has lapsed — you can view your data but not make changes. '
              : 'Your last payment failed — please check your payment method. '}
            <a href="/app/billing" className="underline">Manage billing</a>
          </div>
        )}
```

- [ ] **Step 10: Run the full frontend test suite**

Run: `cd platform/frontend && npm test`
Expected: PASS, no regressions.

- [ ] **Step 11: Typecheck / build**

Run: `cd platform/frontend && npm run build`
Expected: no type errors, build succeeds.

- [ ] **Step 12: Commit**

```bash
cd platform/frontend
git add src/context/AuthContext.tsx src/components/AppShell.tsx src/pages/billing/BillingSettingsPage.tsx src/App.tsx tests/
git commit -m "Add subscription gate, trial/lapsed status banner, and billing settings page"
```

---

## After all tasks

Deploy both `platform/api` and `platform/frontend` per
`docs/AI_HANDOFF.md`'s "Deploying" section, including running the new
Prisma migration on `barkie_prod` (`npx prisma migrate deploy`, already
part of the standard API redeploy command) and the seed script (`npx
prisma db seed`) to create the 3 `Plan` rows in production.

**Before restarting `barkie-api.service`**, add the PayFast and PayPal
credentials to `/opt/barkie/api/.env` (never committed) — collected
directly from the user at this point, matching the SMTP app-password
pattern: `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`,
`PAYFAST_PASSPHRASE`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`,
`PAYPAL_WEBHOOK_ID`. The PayPal webhook ID specifically requires
registering the webhook URL (`https://barkie.co.za/api/webhooks/paypal`)
in the PayPal developer dashboard first, which produces the webhook ID —
this is a manual one-time setup step in PayPal's dashboard, not
something this plan's code can do for you.

**Smoke test, using each provider's sandbox mode first** (do not use
live credentials for the first test): register a throwaway tenant,
verify, log in, confirm the `/plans` redirect fires, pick Tier 1 +
PayFast, confirm the redirect to PayFast's sandbox checkout page loads
with a valid-looking signed URL. Repeat for PayPal. Full end-to-end
payment confirmation (including a real webhook round-trip) needs a real
sandbox account interaction — walk through PayFast's and PayPal's own
sandbox test-buyer flows once, confirm the webhook lands and the
`Subscription.status` updates to `active` in the database. Only then
switch to live credentials.

Update `docs/AI_HANDOFF.md` and local memory once this is live. Add a
note about the `requireActiveSubscription` middleware's method-based
self-filtering pattern, since it's a genuinely different middleware
pattern from `requireTenantAuth` and worth flagging for anyone adding a
new resource router later — they need to remember both middlewares, not
just `requireTenantAuth`.

---

## Addendum: Tasks 8-10 — final whole-branch review findings (2026-09-09)

The whole-branch review after Task 7 found three Critical, financial-
correctness gaps that no single task's scope could see (each is an
interaction between tasks, not a bug in any one task): webhooks can
never actually update a subscription's status because
`providerSubscriptionId` is never persisted anywhere; cancellation never
reaches the payment provider, so a canceled tenant keeps being charged
while Barkie has already revoked their access; and an abandoned checkout
grants permanent free access, since `trialEndsAt` is never enforced.
Tasks 8-10 close these and the related Important/Minor findings from
that review. Same rhythm as Tasks 1-7: brief → implement → review →
fix loop → next task.

**Do not merge before Task 8 is done — Tasks 8's three fixes are the
actual point of this addendum.** Tasks 9-10 are important but
non-blocking relative to Task 8's financial correctness gaps.

### Task 8: Persist provider subscription IDs, real cancellation, trial expiry enforcement

**Files:**
- Modify: `platform/api/prisma/schema.prisma`
- Modify: `platform/api/src/db/scoped.ts`
- Modify: `platform/api/src/env.ts`
- Modify: `platform/api/src/billing/payfastProvider.ts`
- Modify: `platform/api/src/billing/paypalProvider.ts`
- Modify: `platform/api/src/routes/billing.ts`
- Modify: `platform/api/src/routes/webhooks.ts`
- Modify: `platform/api/src/middleware/requireActiveSubscription.ts`
- Modify: `platform/api/tests/helpers/testApp.ts`
- Modify: `platform/api/tests/payfastProvider.test.ts`
- Modify: `platform/api/tests/paypalProvider.test.ts`
- Modify: `platform/api/tests/billing.test.ts`
- Modify: `platform/api/tests/webhooks.test.ts`
- Modify: `platform/api/tests/requireActiveSubscription.test.ts`

**Interfaces:**
- `PaymentProvider.createSubscriptionCheckout(...)` now returns
  `{ redirectUrl: string; providerSubscriptionId?: string }` (PayPal
  always sets it — the subscription is created synchronously via their
  API; PayFast never does — no synchronous "create" call exists for it,
  only a signed redirect URL).
- `PaymentProvider` gains `cancelSubscription(providerSubscriptionId:
  string): Promise<void>`.
- `NormalizedSubscriptionEvent` gains `tenantId?: string` (PayFast
  populates it, parsed from `m_payment_id`; PayPal leaves it undefined
  and relies on `providerSubscriptionId` being persisted at checkout).
- `UpdateSubscriptionExtra` (scoped.ts) gains `pastDueSince?: Date |
  null`.

- [ ] **Step 1: Add `pastDueSince` to the schema and migrate**

In `platform/api/prisma/schema.prisma`, change the `Subscription`
model's `currentPeriodEnd` line:

```prisma
  currentPeriodEnd       DateTime? @db.Timestamptz(3)
```

to:

```prisma
  currentPeriodEnd       DateTime? @db.Timestamptz(3)
  // Set only on the active/trialing -> past_due transition, cleared on
  // recovery to active. The 7-day grace window in
  // requireActiveSubscription.ts anchors on THIS, not updatedAt, because
  // updatedAt gets bumped on every provider retry of a still-failing
  // charge — anchoring the grace window there would let it reset
  // indefinitely and a permanently-dead card would never actually lapse.
  pastDueSince           DateTime? @db.Timestamptz(3)
```

Run:
```bash
cd platform/api
npx prisma migrate dev --name add_subscription_past_due_since
node --env-file=.env.test node_modules/prisma/build/index.js migrate deploy
```

- [ ] **Step 2: Add `pastDueSince` to `scoped.ts`**

In `platform/api/src/db/scoped.ts`, change:

```typescript
export interface UpdateSubscriptionExtra {
  providerSubscriptionId?: string;
  currentPeriodEnd?: Date;
}
```

to:

```typescript
export interface UpdateSubscriptionExtra {
  providerSubscriptionId?: string;
  currentPeriodEnd?: Date;
  pastDueSince?: Date | null;
}
```

Add a `delete` method to the `subscription` group (needed by Task 8's
Step 8 resubscribe-after-cancel fix) — after the existing
`updateStatus` method, before the group's closing `},`:

```typescript
      delete: () => prisma.subscription.deleteMany({ where: { tenantId } }),
```

- [ ] **Step 3: Make `paymentsLive` its own env var, not derived from `NODE_ENV`**

In `platform/api/src/env.ts`, change:

```typescript
  paymentsLive: process.env.NODE_ENV === 'production',
```

to:

```typescript
  // Deliberately NOT derived from NODE_ENV — the deploy step's own
  // sandbox-first smoke test (see this plan's "After all tasks" section)
  // needs to run against sandbox PayFast/PayPal endpoints from the
  // production-deployed service (NODE_ENV=production there), which would
  // be impossible if this were tied to NODE_ENV. Flip explicitly once the
  // sandbox pass is confirmed working.
  paymentsLive: process.env.PAYMENTS_LIVE === 'true',
```

- [ ] **Step 4: Widen the `PaymentProvider` interface**

In `platform/api/src/billing/payfastProvider.ts`, change:

```typescript
export interface PaymentProvider {
  createSubscriptionCheckout(params: {
    tenantId: string;
    plan: { id: string; name: string; monthlyPrice: string };
    trialDays: number;
    returnUrl: string;
    webhookUrl: string;
  }): Promise<{ redirectUrl: string }>;
  verifyWebhookSignature(req: Request): boolean | Promise<boolean>;
  parseWebhookEvent(req: Request): NormalizedSubscriptionEvent | null;
}

export interface NormalizedSubscriptionEvent {
  providerSubscriptionId: string;
  type: 'activated' | 'payment_succeeded' | 'payment_failed' | 'canceled';
}
```

to:

```typescript
export interface PaymentProvider {
  createSubscriptionCheckout(params: {
    tenantId: string;
    plan: { id: string; name: string; monthlyPrice: string };
    trialDays: number;
    returnUrl: string;
    webhookUrl: string;
  }): Promise<{ redirectUrl: string; providerSubscriptionId?: string }>;
  verifyWebhookSignature(req: Request): boolean | Promise<boolean>;
  parseWebhookEvent(req: Request): NormalizedSubscriptionEvent | null;
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
}

export interface NormalizedSubscriptionEvent {
  providerSubscriptionId: string;
  // Only PayFast sets this (parsed from m_payment_id, which it always
  // echoes back) — PayFast has no synchronous "create" API call, so no
  // providerSubscriptionId is known until the first webhook arrives, and
  // resolving the tenant by ID alone doesn't work for that first event.
  // PayPal's checkout DOES return a real subscription id synchronously
  // (captured at checkout time, Step 6 below), so its events resolve via
  // providerSubscriptionId alone and this stays undefined.
  tenantId?: string;
  type: 'activated' | 'payment_succeeded' | 'payment_failed' | 'canceled';
}
```

- [ ] **Step 5: Update the PayFast adapter — `tenantId` parsing, `cancelSubscription`**

In `platform/api/src/billing/payfastProvider.ts`, change `parseWebhookEvent`
from:

```typescript
    parseWebhookEvent(req: Request): NormalizedSubscriptionEvent | null {
      if (!req.body || typeof req.body !== 'object') return null;
      const body = req.body as Record<string, string>;
      const providerSubscriptionId = body.token;
      if (!providerSubscriptionId) return null;
      if (body.payment_status === 'COMPLETE') {
        return { providerSubscriptionId, type: 'payment_succeeded' };
      }
      if (body.payment_status === 'FAILED') {
        return { providerSubscriptionId, type: 'payment_failed' };
      }
      if (body.payment_status === 'CANCELLED') {
        return { providerSubscriptionId, type: 'canceled' };
      }
      return null;
    },
  };
}
```

to:

```typescript
    parseWebhookEvent(req: Request): NormalizedSubscriptionEvent | null {
      if (!req.body || typeof req.body !== 'object') return null;
      const body = req.body as Record<string, string>;
      const providerSubscriptionId = body.token;
      if (!providerSubscriptionId) return null;
      const tenantId = body.m_payment_id?.startsWith('sub_') ? body.m_payment_id.slice(4) : undefined;
      const base = { providerSubscriptionId, tenantId };
      if (body.payment_status === 'COMPLETE') {
        return { ...base, type: 'payment_succeeded' };
      }
      if (body.payment_status === 'FAILED') {
        return { ...base, type: 'payment_failed' };
      }
      if (body.payment_status === 'CANCELLED') {
        return { ...base, type: 'canceled' };
      }
      return null;
    },

    async cancelSubscription(providerSubscriptionId: string): Promise<void> {
      // PayFast's subscription-cancel API — distinct from the checkout
      // signature scheme above (this one signs merchant-id + timestamp,
      // not the request body), and it's a single host (api.payfast.co.za)
      // for both sandbox and live — sandbox mode is selected via the
      // ?testing=true query param, not a different host the way the
      // checkout redirect and ITN-validate endpoints are. Header names
      // and the exact signed-field set are per PayFast's published API
      // docs as of this plan's writing; like the ITN field names in
      // Task 2, this needs one live sandbox call to confirm before real
      // money is involved (see this plan's "After all tasks" section).
      const timestamp = new Date().toISOString().slice(0, 19);
      const signature = buildSignature({ 'merchant-id': config.merchantId, timestamp }, config.passphrase);
      const testingParam = config.live ? '' : '?testing=true';
      const res = await fetch(`https://api.payfast.co.za/subscriptions/${providerSubscriptionId}/cancel${testingParam}`, {
        method: 'PUT',
        headers: {
          'merchant-id': config.merchantId,
          version: 'v1',
          timestamp,
          signature,
        },
      });
      if (!res.ok) {
        throw new Error(`PayFast cancelSubscription failed: ${res.status} ${await res.text()}`);
      }
    },
  };
}
```

- [ ] **Step 6: Update the PayPal adapter — capture the subscription id, `res.ok` checks, `cancelSubscription`**

In `platform/api/src/billing/paypalProvider.ts`, change `getAccessToken`
from:

```typescript
  async function getAccessToken(): Promise<string> {
    const res = await fetchImpl(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const data = await res.json();
    return data.access_token;
  }
```

to:

```typescript
  async function getAccessToken(): Promise<string> {
    const res = await fetchImpl(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
      throw new Error(`PayPal getAccessToken failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    return data.access_token;
  }
```

Change the `createSubscriptionCheckout` body from (only the parts that
change — the product/plan creation calls in the middle are unchanged,
just add the same `if (!res.ok) throw ...` pattern after each, following
the `getAccessToken` example above, to `productRes`, `planRes`, and
`subscriptionRes`):

```typescript
      const subscription = await subscriptionRes.json();
      const approveLink = subscription.links.find((link: { rel: string; href: string }) => link.rel === 'approve');

      return { redirectUrl: approveLink.href };
    },
```

to:

```typescript
      const subscription = await subscriptionRes.json();
      const approveLink = subscription.links.find((link: { rel: string; href: string }) => link.rel === 'approve');
      if (!approveLink) {
        throw new Error('PayPal subscription response had no approve link');
      }

      return { redirectUrl: approveLink.href, providerSubscriptionId: subscription.id };
    },
```

Add `cancelSubscription` as a new method in the returned object, after
`parseWebhookEvent`:

```typescript
    async cancelSubscription(providerSubscriptionId: string): Promise<void> {
      const accessToken = await getAccessToken();
      const res = await fetchImpl(`${baseUrl}/v1/billing/subscriptions/${providerSubscriptionId}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Canceled by tenant' }),
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(`PayPal cancelSubscription failed: ${res.status} ${await res.text()}`);
      }
    },
```

Also add `if (!res.ok) throw ...` (matching `getAccessToken`'s pattern,
substituting the right variable name and a descriptive message) right
after each of the `productRes`, `planRes`, and `subscriptionRes` fetch
calls earlier in `createSubscriptionCheckout`, before their `.json()`
call — four total `res.ok` checks added across this file (token,
product, plan, subscription), matching Important finding I5 from the
review.

- [ ] **Step 7: Rework `POST /api/billing/checkout` — call the provider first, allow resubscribe after cancel/lapse**

In `platform/api/src/routes/billing.ts`, change:

```typescript
  const scoped = tenantScope(req.tenantId!);
  const existing = await scoped.subscription.get();
  if (existing) {
    return res.status(400).json({ ok: false, error: 'You already have a subscription.' });
  }

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  await scoped.subscription.create({
    planId: plan.id,
    status: 'trialing',
    paymentProvider: providerName,
    trialEndsAt,
  });

  const provider = providers[providerName];
  const { redirectUrl } = await provider.createSubscriptionCheckout({
    tenantId: req.tenantId!,
    plan: { id: plan.id, name: plan.name, monthlyPrice: plan.monthlyPrice.toFixed(2) },
    trialDays: TRIAL_DAYS,
    returnUrl: `${env.frontendOrigin}${env.frontendBasePath}/billing/complete`,
    webhookUrl: `${env.frontendOrigin}/api/webhooks/${providerName}`,
  });

  res.json({ ok: true, redirectUrl });
});
```

to:

```typescript
  const scoped = tenantScope(req.tenantId!);
  const existing = await scoped.subscription.get();
  if (existing && existing.status !== 'canceled' && existing.status !== 'lapsed') {
    return res.status(400).json({ ok: false, error: 'You already have a subscription.' });
  }

  // Call the provider FIRST, before writing anything — if this throws
  // (bad credentials, network issue, provider outage), no orphan
  // subscription row is left behind blocking every future checkout
  // attempt via the "already have a subscription" check above.
  const provider = providers[providerName];
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const { redirectUrl, providerSubscriptionId } = await provider.createSubscriptionCheckout({
    tenantId: req.tenantId!,
    plan: { id: plan.id, name: plan.name, monthlyPrice: plan.monthlyPrice.toFixed(2) },
    trialDays: TRIAL_DAYS,
    returnUrl: `${env.frontendOrigin}${env.frontendBasePath}/billing/complete`,
    webhookUrl: `${env.frontendOrigin}/api/webhooks/${providerName}`,
  });

  if (existing) {
    // A previously canceled/lapsed subscription is a dead row — this is
    // a genuinely new subscription attempt, not an update to the old one.
    await scoped.subscription.delete();
  }
  await scoped.subscription.create({
    planId: plan.id,
    status: 'trialing',
    paymentProvider: providerName,
    trialEndsAt,
    providerSubscriptionId,
  });

  res.json({ ok: true, redirectUrl });
});
```

- [ ] **Step 8: Make `POST /api/billing/cancel` call the provider**

In `platform/api/src/routes/billing.ts`, change:

```typescript
billingRouter.post('/api/billing/cancel', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const subscription = await scoped.subscription.get();
  if (!subscription) {
    return res.status(400).json({ ok: false, error: 'No subscription to cancel.' });
  }
  await scoped.subscription.updateStatus('canceled');
  res.json({ ok: true });
});
```

to:

```typescript
billingRouter.post('/api/billing/cancel', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const subscription = await scoped.subscription.get();
  if (!subscription) {
    return res.status(400).json({ ok: false, error: 'No subscription to cancel.' });
  }
  if (!subscription.providerSubscriptionId) {
    // No provider-side subscription was ever confirmed (e.g. a PayFast
    // trial where the first ITN hasn't landed yet) — nothing to cancel
    // there, just cancel locally.
    await scoped.subscription.updateStatus('canceled');
    return res.json({ ok: true });
  }
  const provider = providers[subscription.paymentProvider];
  await provider.cancelSubscription(subscription.providerSubscriptionId);
  await scoped.subscription.updateStatus('canceled');
  res.json({ ok: true });
});
```

- [ ] **Step 9: Rework `applyEvent` in `webhooks.ts` to resolve by `tenantId` OR `providerSubscriptionId`, and persist the id on first contact**

In `platform/api/src/routes/webhooks.ts`, change:

```typescript
async function applyEvent(event: NormalizedSubscriptionEvent): Promise<void> {
  if (!event.providerSubscriptionId) return;

  const subscription = await prisma.subscription.findFirst({
    where: { providerSubscriptionId: event.providerSubscriptionId },
  });
  if (!subscription) return;

  if (event.type === 'activated' || event.type === 'payment_succeeded') {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'active', currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });
  } else if (event.type === 'payment_failed') {
    await prisma.subscription.update({ where: { id: subscription.id }, data: { status: 'past_due' } });
  } else if (event.type === 'canceled') {
    await prisma.subscription.update({ where: { id: subscription.id }, data: { status: 'canceled' } });
  }
}
```

to:

```typescript
async function applyEvent(event: NormalizedSubscriptionEvent): Promise<void> {
  if (!event.providerSubscriptionId) return;

  // PayFast's first-ever event for a subscription can't be found by
  // providerSubscriptionId (nothing was persisted at checkout time,
  // since PayFast has no synchronous "create" call) — resolve by the
  // tenantId the adapter parsed from the payload instead. PayPal always
  // has providerSubscriptionId persisted already (captured synchronously
  // at checkout), so event.tenantId stays undefined for it and this
  // branch is skipped.
  const subscription = event.tenantId
    ? await prisma.subscription.findUnique({ where: { tenantId: event.tenantId } })
    : await prisma.subscription.findFirst({ where: { providerSubscriptionId: event.providerSubscriptionId } });
  if (!subscription) return;

  // First contact for a PayFast subscription — persist the real token
  // now that we have it, so subsequent lookups (and a future cancel
  // call) can use providerSubscriptionId like PayPal's always could.
  const providerIdPatch = subscription.providerSubscriptionId ? {} : { providerSubscriptionId: event.providerSubscriptionId };

  if (event.type === 'activated' || event.type === 'payment_succeeded') {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        pastDueSince: null,
        ...providerIdPatch,
      },
    });
  } else if (event.type === 'payment_failed') {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'past_due',
        // Only stamp pastDueSince on the FIRST failure — a provider's own
        // automatic retries of a still-failing charge send another
        // payment_failed event days later, and re-stamping this on every
        // retry would reset the grace-period clock indefinitely (the
        // exact bug the final whole-branch review flagged).
        pastDueSince: subscription.status === 'past_due' ? subscription.pastDueSince : new Date(),
        ...providerIdPatch,
      },
    });
  } else if (event.type === 'canceled') {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'canceled', ...providerIdPatch },
    });
  }
}
```

- [ ] **Step 10: Enforce trial expiry and use `pastDueSince` for the grace window, in `requireActiveSubscription`**

In `platform/api/src/middleware/requireActiveSubscription.ts`, change
the whole file from:

```typescript
import type { Request, Response, NextFunction } from 'express';
import { tenantScope } from '../db/scoped.js';

const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET') {
    return next();
  }

  const scoped = tenantScope(req.tenantId!);
  const subscription = await scoped.subscription.get();

  if (!subscription) {
    return res.status(402).json({ ok: false, error: 'Start a subscription to continue.' });
  }

  if (subscription.status === 'trialing' || subscription.status === 'active') {
    return next();
  }

  if (subscription.status === 'past_due') {
    const withinGrace = Date.now() - subscription.updatedAt.getTime() < GRACE_PERIOD_MS;
    if (withinGrace) {
      return next();
    }
  }

  return res.status(402).json({ ok: false, error: 'Your subscription has lapsed. Update your payment method to continue.' });
}
```

to:

```typescript
import type { Request, Response, NextFunction } from 'express';
import { tenantScope } from '../db/scoped.js';

const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
// A little slack past the exact trialEndsAt instant so a webhook that's
// running slightly behind (network latency, provider processing delay)
// doesn't lock out a tenant whose card was actually charged successfully
// moments before this check runs.
const TRIAL_EXPIRY_SLACK_MS = 24 * 60 * 60 * 1000;

export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET') {
    return next();
  }

  const scoped = tenantScope(req.tenantId!);
  const subscription = await scoped.subscription.get();

  if (!subscription) {
    return res.status(402).json({ ok: false, error: 'Start a subscription to continue.' });
  }

  if (subscription.status === 'active') {
    return next();
  }

  if (subscription.status === 'trialing') {
    const trialExpired = Date.now() - subscription.trialEndsAt.getTime() > TRIAL_EXPIRY_SLACK_MS;
    if (!trialExpired) {
      return next();
    }
    // The trial ran out with no successful charge ever recorded (no
    // webhook moved this to 'active') — self-heal the status the same
    // way expired sessions self-prune elsewhere in this codebase, so a
    // second request against this tenant doesn't re-derive the same
    // conclusion from scratch.
    await scoped.subscription.updateStatus('lapsed').catch(() => {});
    return res.status(402).json({ ok: false, error: 'Your free trial has ended. Complete payment setup to continue.' });
  }

  if (subscription.status === 'past_due') {
    const withinGrace = subscription.pastDueSince
      ? Date.now() - subscription.pastDueSince.getTime() < GRACE_PERIOD_MS
      : true; // no pastDueSince recorded yet (shouldn't normally happen) — err permissive, not punitive
    if (withinGrace) {
      return next();
    }
    await scoped.subscription.updateStatus('lapsed').catch(() => {});
  }

  return res.status(402).json({ ok: false, error: 'Your subscription has lapsed. Update your payment method to continue.' });
}
```

- [ ] **Step 11: Seed the 3 plans inside `resetTestDatabase`, so the test suite is self-sufficient**

In `platform/api/tests/helpers/testApp.ts`, change:

```typescript
import { prisma } from '../../src/db/client.js';

export async function resetTestDatabase() {
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
}
```

to:

```typescript
import { prisma } from '../../src/db/client.js';

const SEED_PLANS = [
  { name: 'Tier 1', monthlyPrice: '25.00', sortOrder: 1 },
  { name: 'Tier 2', monthlyPrice: '45.00', sortOrder: 2 },
  { name: 'Tier 3', monthlyPrice: '70.00', sortOrder: 3 },
];

export async function resetTestDatabase() {
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

  // Ensure the 3 billing plans always exist for tests, without depending
  // on `prisma db seed` having been run manually against the test DB —
  // every backend test that touches billing (directly or via a router's
  // login helper creating a subscription) needs these rows to exist.
  for (const plan of SEED_PLANS) {
    const existing = await prisma.plan.findFirst({ where: { name: plan.name } });
    if (!existing) {
      await prisma.plan.create({ data: plan });
    }
  }
}
```

- [ ] **Step 12: Update existing tests for the new interfaces**

The `PaymentProvider` interface now requires `cancelSubscription`, and
`createSubscriptionCheckout`'s return type gained an optional field —
every place a test builds a fake/mock provider or asserts on
`applyEvent`'s behavior needs updating:

In `platform/api/tests/payfastProvider.test.ts` and
`platform/api/tests/paypalProvider.test.ts`: add a test for
`cancelSubscription` to each, mocking the relevant HTTP call(s) the same
way the existing tests in each file already mock `fetch`/`fetchImpl`,
and asserting the right endpoint/method/headers are used. For PayFast,
also add a test confirming `parseWebhookEvent` extracts `tenantId`
correctly from an `m_payment_id` like `sub_abc123` (expect `tenantId:
'abc123'`), and that it stays `undefined` when `m_payment_id` doesn't
start with `sub_`.

In `platform/api/tests/webhooks.test.ts`: update the existing
`makeTrialingTenant` helper's created subscription to NOT set
`providerSubscriptionId` initially for the PayFast case (since Step 9's
fix means it's only persisted on first webhook contact) — add a new
test proving the FIRST webhook for a fresh PayFast subscription (created
via checkout with no `providerSubscriptionId` yet) resolves via the
mocked event's `tenantId` field and persists `providerSubscriptionId`
onto the row. Add a test proving a SECOND `payment_failed` event (the
subscription already `past_due`) does NOT change `pastDueSince` from
its first-recorded value (construct this by manually setting
`pastDueSince` to some earlier date via `prisma.subscription.update`
before sending the second event, then asserting it's unchanged after).

In `platform/api/tests/requireActiveSubscription.test.ts`: add a test
for a `trialing` subscription whose `trialEndsAt` is in the past beyond
the slack window — asserts `402` AND that the subscription's status was
updated to `'lapsed'` in the DB afterward (self-healing). Update the
existing `past_due`-grace-window tests to set `pastDueSince` (not just
rely on `updatedAt`) when constructing their fixtures, since the
middleware now reads that field.

In `platform/api/tests/billing.test.ts`: add tests for the checkout
route's new provider-first ordering (mock the provider's
`createSubscriptionCheckout` to reject, assert NO subscription row was
created — this is the regression test for the orphan-row bug); add a
test for cancel calling `provider.cancelSubscription` (mock it, assert
it was called with the right `providerSubscriptionId`, assert local
status becomes `canceled`); add a test proving a `canceled` tenant CAN
call checkout again successfully (the old row's data doesn't linger and
block it).

- [ ] **Step 13: Run the full suite and typecheck**

Run: `cd platform/api && npm test && npm run typecheck`
Expected: PASS, including every new test from Step 12.

- [ ] **Step 14: Commit**

```bash
cd platform/api
git add prisma/schema.prisma prisma/migrations src/db/scoped.ts src/env.ts src/billing/payfastProvider.ts src/billing/paypalProvider.ts src/routes/billing.ts src/routes/webhooks.ts src/middleware/requireActiveSubscription.ts tests/helpers/testApp.ts tests/payfastProvider.test.ts tests/paypalProvider.test.ts tests/billing.test.ts tests/webhooks.test.ts tests/requireActiveSubscription.test.ts
git commit -m "Persist provider subscription IDs, call the provider on cancel, enforce trial expiry, fix the grace-period reset bug (closes final-review Critical findings C1-C3, Important I1/I2/I4/I5/I7)"
```

---

### Task 9: PayFast server-to-server ITN postback validation

**Files:**
- Modify: `platform/api/src/billing/payfastProvider.ts`
- Modify: `platform/api/tests/payfastProvider.test.ts`

**Interfaces:**
- `verifyWebhookSignature` gains a second validation layer — local
  signature check (unchanged) THEN a server-to-server call back to
  PayFast confirming the ITN is genuine, per the approved design spec
  (`docs/superpowers/specs/2026-09-08-billing-subscription-design.md`'s
  PayFast section) — both must pass.

- [ ] **Step 1: Add the postback validation call**

In `platform/api/src/billing/payfastProvider.ts`, change
`verifyWebhookSignature` from:

```typescript
    verifyWebhookSignature(req: Request): boolean {
      if (!req.body || typeof req.body !== 'object') return false;
      const body = req.body as Record<string, string>;
      const { signature, ...rest } = body;
      if (!signature) return false;
      return safeCompare(buildSignature(rest, config.passphrase), signature);
    },
```

to:

```typescript
    async verifyWebhookSignature(req: Request): Promise<boolean> {
      if (!req.body || typeof req.body !== 'object') return false;
      const body = req.body as Record<string, string>;
      const { signature, ...rest } = body;
      if (!signature) return false;
      if (!safeCompare(buildSignature(rest, config.passphrase), signature)) return false;

      // Defense-in-depth beyond the local signature check: confirm the
      // ITN is genuine by posting the exact received body back to
      // PayFast's own validation endpoint. This is required by the
      // approved design spec — the local signature alone shares its only
      // secret (the passphrase) with every outbound checkout URL this
      // adapter builds, so a leaked passphrase would otherwise be
      // sufficient to forge an activation on its own.
      const validateUrl = config.live
        ? 'https://www.payfast.co.za/eng/query/validate'
        : 'https://sandbox.payfast.co.za/eng/query/validate';
      const params = new URLSearchParams(body as Record<string, string>).toString();
      const res = await fetch(validateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      });
      const text = await res.text();
      return text.trim() === 'VALID';
    },
```

(This changes `verifyWebhookSignature` from synchronous to `async` —
the shared `PaymentProvider` interface already allows `boolean |
Promise<boolean>`, and `webhooks.ts`'s `makeWebhookHandler` already
`await Promise.resolve(...)`s the result, so no caller needs to change.)

- [ ] **Step 2: Update tests for the async signature + postback call**

In `platform/api/tests/payfastProvider.test.ts`, the existing
`verifyWebhookSignature` tests construct a real signature and call the
function directly — since it now makes a real `fetch` call to PayFast's
validate endpoint, these tests need `fetch` mocked (globally, via
`mock.method(globalThis, 'fetch', ...)`) to return a `VALID`/non-`VALID`
text response, matching the mocking style already used for `fetchImpl`
injection in `paypalProvider.test.ts`. Update the existing "accepts a
correctly-signed payload" test to mock a `VALID` response and confirm
`true`; add a new test where the local signature is correct but the
mocked postback response is NOT `VALID` (e.g. `'INVALID'`), confirming
the function returns `false` — proving the postback layer is genuinely
consulted, not just present in the code.

- [ ] **Step 3: Run the tests and typecheck**

Run: `cd platform/api && npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
cd platform/api
git add src/billing/payfastProvider.ts tests/payfastProvider.test.ts
git commit -m "Add PayFast server-to-server ITN postback validation (closes final-review Important I6)"
```

---

### Task 10: Minor hygiene from the final review

**Files:**
- Modify: `platform/frontend/src/components/AppShell.tsx`
- Modify: `platform/api/src/billing/paypalProvider.ts`
- Create: `platform/api/src/billing/types.ts`
- Modify: `platform/api/src/billing/payfastProvider.ts`
- Modify: `platform/api/prisma/seed.ts`
- Modify: `platform/api/tests/paypalProvider.test.ts`

- [ ] **Step 1: Use a real `<Link>` for the "Manage billing" banner link**

In `platform/frontend/src/components/AppShell.tsx`, find the
past_due/lapsed banner's `<a href="/app/billing">Manage billing</a>` and
replace it with React Router's `<Link to="/billing">Manage billing</Link>`
(the `Link` import already exists in this file for the nav items) — the
hardcoded `/app/` prefix 404s outside production, and a real `<Link>`
avoids a full page reload.

- [ ] **Step 2: Move the shared provider types out of `payfastProvider.ts`**

Create `platform/api/src/billing/types.ts`:

```typescript
import type { Request } from 'express';

export interface PaymentProvider {
  createSubscriptionCheckout(params: {
    tenantId: string;
    plan: { id: string; name: string; monthlyPrice: string };
    trialDays: number;
    returnUrl: string;
    webhookUrl: string;
  }): Promise<{ redirectUrl: string; providerSubscriptionId?: string }>;
  verifyWebhookSignature(req: Request): boolean | Promise<boolean>;
  parseWebhookEvent(req: Request): NormalizedSubscriptionEvent | null;
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
}

export interface NormalizedSubscriptionEvent {
  providerSubscriptionId: string;
  tenantId?: string;
  type: 'activated' | 'payment_succeeded' | 'payment_failed' | 'canceled';
}
```

In `platform/api/src/billing/payfastProvider.ts`, remove the
`PaymentProvider`/`NormalizedSubscriptionEvent` interface declarations
(now living in `types.ts`) and add `import type { PaymentProvider,
NormalizedSubscriptionEvent } from './types.js';` near the top.

Update every file that currently imports these two types from
`./payfastProvider.js` (`paypalProvider.ts`, `routes/billing.ts`,
`routes/webhooks.ts`, and any test file that imports them) to import
from `./types.js`/`../billing/types.js` instead.

- [ ] **Step 3: Only set a plan's price on create, not on every seed re-run**

In `platform/api/prisma/seed.ts`, change:

```typescript
async function main() {
  for (const plan of PLANS) {
    const existing = await prisma.plan.findFirst({ where: { name: plan.name } });
    if (existing) {
      await prisma.plan.update({ where: { id: existing.id }, data: plan });
    } else {
      await prisma.plan.create({ data: plan });
    }
  }
}
```

to:

```typescript
async function main() {
  for (const plan of PLANS) {
    const existing = await prisma.plan.findFirst({ where: { name: plan.name } });
    if (!existing) {
      // Create-only: a manual price edit in the DB (the intended way to
      // change pricing until the admin center exists — see the design
      // spec) must survive a re-run of this seed script. Only sortOrder
      // and active-flag drift would ever need re-syncing here, and
      // neither of those exists yet, so a bare create-if-missing is
      // correct — revisit if this script ever needs to reconcile more
      // than existence.
      await prisma.plan.create({ data: plan });
    }
  }
}
```

- [ ] **Step 4: Remove the unused `mock` import**

In `platform/api/tests/paypalProvider.test.ts`, remove `mock` from the
`import { test, mock } from 'node:test';` line if it's genuinely unused
(check first — Task 9's changes to `payfastProvider.test.ts` don't
touch this file, but Task 8's Step 12 additions to THIS file might have
introduced a real use of `mock` by the time this step runs; only remove
it if it's still unused after Task 8's changes land).

- [ ] **Step 5: Run the full suite (both packages) and typecheck/build**

Run:
```bash
cd platform/api && npm test && npm run typecheck
cd ../frontend && npm test && npm run build
```
Expected: PASS on both.

- [ ] **Step 6: Commit**

```bash
git add platform/frontend/src/components/AppShell.tsx platform/api/src/billing/types.ts platform/api/src/billing/payfastProvider.ts platform/api/src/billing/paypalProvider.ts platform/api/src/routes/billing.ts platform/api/src/routes/webhooks.ts platform/api/prisma/seed.ts platform/api/tests/paypalProvider.test.ts
git commit -m "Minor hygiene from final review: real Link for billing banner, shared provider types file, create-only seed pricing (closes M1, M4, M8)"
```

---

## After Tasks 8-10

Same deploy/smoke-test steps as originally planned in "After all tasks"
above, with one addition to the sandbox smoke test given C1-C3: after
confirming a sandbox checkout redirects correctly, actually complete
the provider's sandbox test-buyer flow and confirm (a) the webhook
lands and `Subscription.status` becomes `active` with
`providerSubscriptionId` populated, (b) canceling from Barkie's billing
settings page results in the sandbox provider showing the subscription
as canceled on ITS side too (not just locally), and (c) a subscription
manually set to `trialing` with a `trialEndsAt` in the past gets a 402
on the next mutating request and flips to `lapsed` in the database.
These three checks are the direct regression tests for C1, C2, and C3
against real (sandbox) provider behavior, which nothing in the
automated test suite can fully substitute for.
