# Billing & Subscription — Design Spec

**Status:** Approved 2026-09-08. Implements backlog item #25 (Phase 2:
Subscription & billing automation) — 14-day trial, PayFast + PayPal
recurring billing, lapsed/read-only account handling.

## Goal

Every tenant, after verifying their email, picks a plan and sets up a
payment method (via PayFast or PayPal's own hosted checkout — Barkie
never touches card data). They get a 14-day free trial; the provider
auto-charges at day 14 on its own schedule. A failed/missing charge moves
the account to a **read-only** state rather than blocking login or
destroying data.

## Decisions already made (not open for re-litigation in this spec)

- Three plans, prices in the database, not code: **Tier 1 — R25**,
  **Tier 2 — R45**, **Tier 3 — R70** (monthly). Editable via a direct DB
  update until the admin center (backlog #26, scoped as the next phase
  after this one) exists.
- Tiers differ in **name/price only for now** — no usage-limit
  enforcement (printer caps, document caps, etc.) in this phase.
- Card captured **at signup**, trial auto-converts to a real charge at
  day 14 — not a "come back and pay" flow.
- Both PayFast and PayPal are offered at checkout; PayFast shown first
  (native ZAR, matches this pricing), PayPal as the alternative.

## Data model

```prisma
model Plan {
  id          String   @id @default(uuid())
  name        String
  monthlyPrice Decimal @db.Decimal(8, 2)
  sortOrder   Int
  active      Boolean  @default(true)
  createdAt   DateTime @default(now()) @db.Timestamptz(3)

  subscriptions Subscription[]
  @@map("plans")
}

model Subscription {
  id                    String    @id @default(uuid())
  tenantId              String    @unique
  planId                String
  status                String    // 'trialing' | 'active' | 'past_due' | 'lapsed' | 'canceled'
  paymentProvider       String    // 'payfast' | 'paypal'
  providerSubscriptionId String?  // set once the provider confirms the subscription
  trialEndsAt           DateTime  @db.Timestamptz(3)
  currentPeriodEnd       DateTime? @db.Timestamptz(3)
  createdAt             DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt             DateTime  @updatedAt @db.Timestamptz(3)

  tenant Tenant @relation(fields: [tenantId], references: [id])
  plan   Plan   @relation(fields: [planId], references: [id])
  @@map("subscriptions")
}
```

One subscription per tenant (`@unique` on `tenantId`) — no
multi-subscription/upgrade-mid-cycle handling in this phase; changing
plans is a cancel-and-resubscribe for now.

## Signup flow

Unchanged up through email verification: register → verify-email →
login, exactly as today. **New step after login, if the tenant has no
`Subscription` row:** the app routes to plan selection instead of the
normal dashboard — this is a hard gate (you cannot use Barkie without at
least a trial started), distinct from the tier *limits* that are
explicitly not enforced.

1. Tenant picks a plan and a provider (PayFast or PayPal).
2. `POST /api/billing/checkout` creates a `Subscription` row (`status:
   'trialing'`, `trialEndsAt: now + 14 days`) and asks the chosen
   provider's adapter to build a hosted recurring-billing checkout,
   returning a `redirectUrl`.
3. Frontend redirects the browser there. The tenant enters card details
   on the provider's own page — never on Barkie's.
4. Provider redirects back to `/billing/complete` on success. The
   provider's webhook (see below) is the actual source of truth for
   confirming the subscription is live — the return redirect is just
   where the user's browser lands, not something the backend trusts on
   its own.
5. Provider auto-charges at day 14 per its own subscription schedule.
   Barkie does not trigger this — it only reacts to the resulting
   webhook.

## Provider integration

Two genuinely different APIs behind one internal interface, so the rest
of the app never branches on which provider a tenant chose:

```typescript
interface PaymentProvider {
  createSubscriptionCheckout(params: {
    tenantId: string;
    plan: Plan;
    trialDays: number;
    returnUrl: string;
    webhookUrl: string;
  }): Promise<{ redirectUrl: string }>;

  verifyWebhookSignature(req: Request): boolean;

  parseWebhookEvent(req: Request): NormalizedSubscriptionEvent | null;
}

interface NormalizedSubscriptionEvent {
  providerSubscriptionId: string;
  type: 'activated' | 'payment_succeeded' | 'payment_failed' | 'canceled';
}
```

- **PayFast**: subscription-type checkout with a future `billing_date`
  (day 14) so the trial period costs nothing; MD5-signed request per
  PayFast's spec. Their ITN (Instant Transaction Notification) callback
  is the webhook — verified via signature + PayFast's documented
  server-to-server postback validation (a second call back to PayFast
  confirming the ITN is genuine, not just signature-checked locally).
- **PayPal**: a Billing Plan with a `TRIAL` billing cycle (14 days, R0)
  followed by the real recurring cycle at the tier's price, created via
  PayPal's Subscriptions API. Webhooks verified via PayPal's
  webhook-signature-verification API call (not just local signature
  math — PayPal requires an API round-trip to verify).

Both adapters translate their provider-specific event vocabulary into
the same `NormalizedSubscriptionEvent`, and one webhook handler per
provider updates `Subscription.status` from that normalized event —
`activated`/`payment_succeeded` → `active`, `payment_failed` →
`past_due` (with a grace window before moving to `lapsed` — see below),
`canceled` → `canceled`.

Exact credential values (merchant IDs, passphrases, API keys/secrets)
are collected the same way the SMTP app password was — directly from
the user immediately before writing them to the VPS `.env`, never
earlier, never committed.

## Lapsed / read-only handling

`past_due` → `lapsed` after a **7-day grace window** past a failed
charge — long enough for a provider's own automatic retry (both PayFast
and PayPal retry a failed recurring charge a few times before giving up)
to succeed without the tenant losing write access over a transient card
issue.

A new `requireActiveSubscription` middleware, applied to every
**mutating** request (`POST`/`PATCH`/`DELETE`) across the existing
resource routers, after `requireTenantAuth`: if the tenant's
subscription status is `lapsed`, respond `402 { ok: false, error: 'Your
subscription has lapsed. Update your payment method to continue.' }`.
`GET` requests are never blocked — a lapsed tenant can still log in and
see everything they had, just not create or change anything. This
touches every existing router (`customersRouter`, `printersRouter`, etc.)
— each needs the new middleware added alongside its existing
`requireTenantAuth`.

## API surface

- `GET /api/plans` — list active plans (id, name, monthlyPrice),
  ordered by `sortOrder`. Requires auth (a logged-in tenant without a
  subscription yet still has a session).
- `POST /api/billing/checkout` — body `{ planId, provider: 'payfast' |
  'paypal' }` → `{ redirectUrl }`.
- `POST /api/webhooks/payfast` — ITN receiver. No `requireTenantAuth`
  (the provider calls this directly, unauthenticated by session — trust
  comes from signature verification instead).
- `POST /api/webhooks/paypal` — same shape, PayPal's verification
  instead.
- `GET /api/billing/subscription` — the current tenant's subscription
  (status, plan, trialEndsAt/currentPeriodEnd) for the frontend status
  banner.
- `POST /api/billing/cancel` — tenant-initiated cancellation; calls the
  provider's own cancel API via the adapter, sets `status: 'canceled'`.

## Frontend

- `PlanSelectionPage` — three plan cards, provider choice, "Start free
  trial" → calls checkout, redirects the browser.
- `BillingCompletePage` — lands here after the provider redirects back;
  polls `/api/billing/subscription` briefly (webhook may arrive a moment
  after the redirect) before routing into the app.
- A route guard (in the existing auth-gated route wrapper) redirects a
  logged-in tenant with no subscription to `PlanSelectionPage` instead of
  the dashboard.
- A trial/status banner in `AppShell` — remaining trial days, or a clear
  "past due"/"lapsed" notice with a link to update payment.
- A minimal billing settings page: current plan, status, "Cancel
  subscription" action.

## What's explicitly out of scope

- Tier-based usage-limit enforcement — pricing/marketing differentiation
  only, per the earlier decision.
- The admin center (backlog #26) — scoped as the next phase after this
  one, not bundled in.
- Plan upgrades/downgrades mid-cycle — changing plans is cancel and
  resubscribe for now.
- Multi-currency beyond what each provider's merchant account already
  settles in (confirmed at real-credential integration time, not
  designable in the abstract).
- Refunds/proration — none of the provider adapters need to support
  this yet.
- Invoicing/tax receipts for the SaaS subscription itself (distinct from
  the existing tenant-facing Quotes/Invoices feature, which is unrelated).

## Testing

- Provider adapters exported as plain objects (matching the `mailer`
  pattern from the real-SMTP phase), mockable via `mock.method` — no
  real network calls to PayFast/PayPal in any test.
- Webhook signature verification tested against both a known-good and a
  tampered payload, constructed from each provider's documented signing
  algorithm (no live credentials needed for this — the algorithm is
  public, only the actual merchant secret is private).
- `requireActiveSubscription` tested directly: a `lapsed` tenant gets
  402 on a mutating request and 200 on a GET; a `trialing`/`active`
  tenant is unaffected.
- The plan-selection gate: a tenant with no subscription is redirected
  away from the dashboard; one with a subscription is not.
