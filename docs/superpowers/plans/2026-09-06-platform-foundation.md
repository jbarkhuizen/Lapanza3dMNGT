# Barkie Platform Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Barkie API's foundation — Postgres schema, tenant registration/login/session auth, and a tenant-isolation query wrapper — proven end-to-end with a real first domain resource (Customers).

**Architecture:** Express + TypeScript API (`platform/api/`), PostgreSQL via Prisma. Every tenant-scoped table carries `tenantId`; all tenant-scoped reads/writes go through a hand-written scoped wrapper (`src/db/scoped.ts`), never the raw Prisma client, so isolation can't be bypassed by forgetting a `where` clause. Auth is email+bcrypt password with an httpOnly session cookie backed by a `sessions` table (no JWT).

**Tech Stack:** Node.js 20+, TypeScript (strict), Express 5, Prisma + PostgreSQL, bcryptjs, zod, express-rate-limit, cors, cookie-parser, dotenv. Tests: Node's built-in `node:test` runner + `supertest`, run via `tsx`.

## Global Constraints

- Node.js >= 20 (required for stable `node --test` glob/watch behavior).
- Package manager: npm (matches lapanza-3d; do not introduce yarn/pnpm).
- TypeScript strict mode (`"strict": true` in tsconfig) — no `any` in new code.
- Use `bcryptjs`, not native `bcrypt` — pure JS, no native build step, matches lapanza-3d's existing choice and avoids Windows build-tool friction.
- Module system: ESM (`"type": "module"` in package.json), matching lapanza-3d.
- Session cookie name: `barkie_session`. Cookie flags: `httpOnly: true`, `sameSite: 'lax'`, `secure: process.env.NODE_ENV === 'production'`.
- API response shape: success `{ ok: true, ...data }`, failure `{ ok: false, error: string }`. Error strings are plain sentences, no "Error:" prefix, no raw exception text leaked to the client.
- All timestamps stored as Postgres `timestamptz`, read back as ISO 8601 strings.
- Directory root for this plan: `platform/api/` (sibling to the existing `landing/` folder, inside the `D:\Projects\Barkie` repo).

---

## File Structure

```
platform/api/
  package.json
  tsconfig.json
  env.sample
  env.test.sample
  prisma/
    schema.prisma
  src/
    env.ts                 # loads + validates process.env
    db/
      client.ts             # PrismaClient singleton
      scoped.ts              # tenant-scoped query wrapper
    auth/
      password.ts            # hash/verify helpers
      session.ts              # create/verify/destroy session, cookie helpers
      email.ts                 # dev-mode "send" verification email
    middleware/
      requireTenantAuth.ts
      requirePlatformAdminAuth.ts
    routes/
      health.ts
      auth.ts
      customers.ts
    app.ts                    # builds and returns the Express app (no listen)
    server.ts                  # imports app, calls app.listen()
  tests/
    helpers/
      testApp.ts               # spins up app + resets test DB between tests
    health.test.ts
    auth.test.ts
    tenant-isolation.test.ts
    customers.test.ts
```

Each file's job:
- `env.ts` — single source of truth for config; throws at startup if a required var is missing, so bad config fails fast instead of surfacing as a 500 later.
- `db/scoped.ts` — the *only* place tenant-scoped tables get queried. Later plans adding new tenant-scoped tables extend this file, not call `prisma.<model>` directly elsewhere.
- `app.ts` vs `server.ts` split — tests import `app.ts` directly (via `supertest`) without binding a real port; `server.ts` is the actual process entrypoint.

---

## Task 1: Project scaffold + health check

**Files:**
- Create: `platform/api/package.json`
- Create: `platform/api/tsconfig.json`
- Create: `platform/api/env.sample`
- Create: `platform/api/src/env.ts`
- Create: `platform/api/src/app.ts`
- Create: `platform/api/src/server.ts`
- Create: `platform/api/src/routes/health.ts`
- Test: `platform/api/tests/health.test.ts`

**Interfaces:**
- Produces: `buildApp(): express.Express` from `src/app.ts` — every later task's tests import this.
- Produces: `env` object from `src/env.ts` with fields `{ port: number, databaseUrl: string, nodeEnv: string, sessionCookieName: string, frontendOrigin: string }`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "barkie-api",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts",
    "test": "node --import tsx --test tests/**/*.test.ts",
    "prisma:migrate": "prisma migrate dev",
    "prisma:generate": "prisma generate"
  },
  "dependencies": {
    "@prisma/client": "^6.5.0",
    "bcryptjs": "^3.0.3",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.6",
    "dotenv": "^17.0.0",
    "express": "^5.2.1",
    "express-rate-limit": "^8.6.2",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/cookie-parser": "^1.4.9",
    "@types/cors": "^2.8.19",
    "@types/express": "^5.0.0",
    "@types/node": "^22.10.0",
    "@types/supertest": "^6.0.2",
    "prisma": "^6.5.0",
    "supertest": "^7.2.2",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `env.sample`**

```
PORT=4200
NODE_ENV=development
DATABASE_URL=postgresql://barkie:barkie@localhost:5432/barkie_dev
FRONTEND_ORIGIN=http://localhost:5174
SESSION_COOKIE_NAME=barkie_session
```

Note: real `.env` and `.env.test` files are not created by this plan (the
Write tool used to author it refuses `.env*` paths) — copy `env.sample` to
`.env` and `env.test.sample` (Task 6) to `.env.test` yourself before running.

- [ ] **Step 4: Create `src/env.ts`**

```typescript
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
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? 'barkie_session',
};
```

- [ ] **Step 5: Create `src/routes/health.ts`**

```typescript
import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'barkie-api' });
});
```

- [ ] **Step 6: Create `src/app.ts`**

```typescript
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
```

- [ ] **Step 7: Create `src/server.ts`**

```typescript
import { buildApp } from './app.js';
import { env } from './env.js';

const app = buildApp();
app.listen(env.port, () => {
  console.log(`Barkie API listening on http://localhost:${env.port}`);
});
```

- [ ] **Step 8: Write the failing test — `tests/health.test.ts`**

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';

test('GET /api/health returns ok', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, service: 'barkie-api' });
});
```

- [ ] **Step 9: Install dependencies and run the test**

Run (from `platform/api/`):
```
npm install
cp env.sample .env
npm test
```
Expected: `health.test.ts` passes (1 test, 0 failures).

- [ ] **Step 10: Commit**

```bash
git add platform/api
git commit -m "Scaffold Barkie API with health check endpoint"
```

---

## Task 2: Prisma schema — tenants, platform admins, sessions, customers

**Files:**
- Create: `platform/api/prisma/schema.prisma`
- Create: `platform/api/src/db/client.ts`
- Test: `platform/api/tests/health.test.ts` (extended — DB connectivity check)

**Interfaces:**
- Consumes: `env.databaseUrl` from Task 1.
- Produces: `prisma` singleton export from `src/db/client.ts`, used by every later task. Produces Prisma models `Tenant`, `PlatformAdmin`, `Session`, `Customer` — exact field names below are relied on by Tasks 3–7.

- [ ] **Step 1: Create `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Tenant {
  id                       String    @id @default(uuid())
  businessName             String
  contactName              String
  email                    String    @unique
  passwordHash             String
  emailVerifiedAt          DateTime?
  verificationToken        String?
  verificationTokenExpires DateTime?
  createdAt                DateTime  @default(now())

  customers Customer[]

  @@map("tenants")
}

model PlatformAdmin {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())

  @@map("platform_admins")
}

model Session {
  token       String   @id
  subjectType String
  subjectId   String
  expiresAt   DateTime
  createdAt   DateTime @default(now())

  @@index([subjectType, subjectId])
  @@map("sessions")
}

model Customer {
  id               String   @id @default(uuid())
  tenantId         String
  name             String
  company          String?
  email            String?
  phone            String?
  billingAddress   String
  deliveryAddress  String?
  vatNumber        String?
  notes            String?
  createdAt        DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@map("customers")
}
```

- [ ] **Step 2: Create `src/db/client.ts`**

```typescript
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
```

- [ ] **Step 3: Set up local Postgres and run the migration**

Prerequisite (one-time, per the earlier decision to install Postgres
natively): install PostgreSQL from postgresql.org, then create the two
databases this plan needs:

```
psql -U postgres -c "CREATE ROLE barkie WITH LOGIN PASSWORD 'barkie';"
psql -U postgres -c "CREATE DATABASE barkie_dev OWNER barkie;"
psql -U postgres -c "CREATE DATABASE barkie_test OWNER barkie;"
```

Then, from `platform/api/` with `.env` in place (`DATABASE_URL` pointing at
`barkie_dev`):
```
npx prisma migrate dev --name init
```
Expected: creates `prisma/migrations/`, applies the schema, prints
"Your database is now in sync with your schema."

- [ ] **Step 4: Extend the health test to prove DB connectivity**

Replace `tests/health.test.ts` with:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db/client.js';

test('GET /api/health returns ok', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, service: 'barkie-api' });
});

test('database connection is alive', async () => {
  const result = await prisma.$queryRaw`SELECT 1 as ok`;
  assert.deepEqual(result, [{ ok: 1 }]);
});
```

- [ ] **Step 5: Run tests against `barkie_dev` to confirm the schema works**

Run:
```
npm test
```
Expected: both tests pass.

- [ ] **Step 6: Commit**

```bash
git add platform/api
git commit -m "Add Prisma schema for tenants, platform admins, sessions, customers"
```

---

## Task 3: Password hashing + tenant registration

**Files:**
- Create: `platform/api/src/auth/password.ts`
- Create: `platform/api/src/routes/auth.ts`
- Modify: `platform/api/src/app.ts`
- Test: `platform/api/tests/helpers/testApp.ts`
- Test: `platform/api/tests/auth.test.ts`

**Interfaces:**
- Consumes: `prisma` from `src/db/client.ts` (Task 2), `Tenant` model fields (Task 2).
- Produces: `hashPassword(plain: string): Promise<string>` and `verifyPassword(plain: string, hash: string): Promise<boolean>` from `src/auth/password.ts` — used by Task 5 (login).
- Produces: `POST /api/auth/register` route.
- Produces: `resetTestDatabase(): Promise<void>` from `tests/helpers/testApp.ts` — used by every remaining test file to start each test from a clean slate.

- [ ] **Step 1: Create `tests/helpers/testApp.ts`**

```typescript
import { prisma } from '../../src/db/client.js';

export async function resetTestDatabase() {
  await prisma.customer.deleteMany();
  await prisma.session.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.platformAdmin.deleteMany();
}
```

- [ ] **Step 2: Create `env.test.sample`**

```
PORT=4201
NODE_ENV=test
DATABASE_URL=postgresql://barkie:barkie@localhost:5432/barkie_test
FRONTEND_ORIGIN=http://localhost:5174
SESSION_COOKIE_NAME=barkie_session
```

Copy this to `.env.test` yourself (see Task 1 note on `.env*` files). Run
the migration against it once too: `DATABASE_URL=postgresql://barkie:barkie@localhost:5432/barkie_test npx prisma migrate deploy`.

- [ ] **Step 3: Write the failing test — `tests/auth.test.ts`**

```typescript
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';

beforeEach(resetTestDatabase);

test('POST /api/auth/register creates an unverified tenant', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/auth/register').send({
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.ok, true);

  const tenant = await prisma.tenant.findUnique({
    where: { email: 'jane@acmeprints.co.za' },
  });
  assert.ok(tenant, 'tenant row should exist');
  assert.equal(tenant?.emailVerifiedAt, null);
  assert.notEqual(tenant?.passwordHash, 'correct horse battery staple');
});

test('POST /api/auth/register rejects a duplicate email', async () => {
  const app = buildApp();
  const payload = {
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  };
  await request(app).post('/api/auth/register').send(payload);
  const res = await request(app).post('/api/auth/register').send(payload);

  assert.equal(res.status, 409);
  assert.equal(res.body.ok, false);
});

test('POST /api/auth/register rejects a missing required field', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/auth/register').send({
    businessName: 'Acme Prints',
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  });

  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `POST /api/auth/register` returns 404 (route doesn't exist yet).

- [ ] **Step 5: Create `src/auth/password.ts`**

```typescript
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 6: Create `src/routes/auth.ts`**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma } from '../db/client.js';
import { hashPassword } from '../auth/password.js';

export const authRouter = Router();

const registerSchema = z.object({
  businessName: z.string().min(1),
  contactName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(10),
});

authRouter.post('/api/auth/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Fill in all required fields with a valid email and a password of at least 10 characters.' });
  }
  const { businessName, contactName, email, password } = parsed.data;

  const existing = await prisma.tenant.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ ok: false, error: 'An account with this email already exists.' });
  }

  const passwordHash = await hashPassword(password);
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.tenant.create({
    data: {
      businessName,
      contactName,
      email,
      passwordHash,
      verificationToken,
      verificationTokenExpires,
    },
  });

  res.status(201).json({ ok: true });
});
```

- [ ] **Step 7: Wire the router into `src/app.ts`**

```typescript
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './env.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';

export function buildApp() {
  const app = express();
  app.use(cors({ origin: env.frontendOrigin, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(healthRouter);
  app.use(authRouter);
  return app;
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass (5 total: 2 from Task 1/2, 3 new).

- [ ] **Step 9: Commit**

```bash
git add platform/api
git commit -m "Add tenant registration with password hashing and validation"
```

---

## Task 4: Email verification (dev-mode sender)

**Files:**
- Create: `platform/api/src/auth/email.ts`
- Modify: `platform/api/src/routes/auth.ts`
- Test: `platform/api/tests/auth.test.ts`

**Interfaces:**
- Consumes: `Tenant.verificationToken`, `Tenant.verificationTokenExpires` (Task 2).
- Produces: `sendVerificationEmail(to: string, token: string): Promise<void>` from `src/auth/email.ts` — a later Phase-2 plan swaps this implementation for real cPanel SMTP without changing its signature, so callers never change.
- Produces: `POST /api/auth/verify-email` route.

- [ ] **Step 1: Create `src/auth/email.ts`**

```typescript
// Dev-mode implementation: logs the verification link instead of sending a
// real email. A later plan replaces the body of this function with
// nodemailer + cPanel SMTP (SRS §2.3) — callers never need to change.
export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `http://localhost:5174/verify-email?token=${token}`;
  console.log(`[dev-email] Verification link for ${to}: ${link}`);
}
```

- [ ] **Step 2: Write the failing test — append to `tests/auth.test.ts`**

```typescript
test('POST /api/auth/verify-email verifies a valid token', async () => {
  const app = buildApp();
  await request(app).post('/api/auth/register').send({
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  });
  const tenant = await prisma.tenant.findUnique({ where: { email: 'jane@acmeprints.co.za' } });

  const res = await request(app)
    .post('/api/auth/verify-email')
    .send({ token: tenant?.verificationToken });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);

  const updated = await prisma.tenant.findUnique({ where: { email: 'jane@acmeprints.co.za' } });
  assert.ok(updated?.emailVerifiedAt, 'emailVerifiedAt should be set');
});

test('POST /api/auth/verify-email rejects an unknown token', async () => {
  const app = buildApp();
  const res = await request(app)
    .post('/api/auth/verify-email')
    .send({ token: 'not-a-real-token' });

  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `POST /api/auth/verify-email` returns 404.

- [ ] **Step 4: Add the route and call the sender — modify `src/routes/auth.ts`**

Add these imports at the top:
```typescript
import { sendVerificationEmail } from '../auth/email.js';
```

Add this call right after `await prisma.tenant.create(...)` in the register handler, before `res.status(201).json({ ok: true });`:
```typescript
  await sendVerificationEmail(email, verificationToken);
```

Append this route to the bottom of the file:
```typescript
const verifyEmailSchema = z.object({ token: z.string().min(1) });

authRouter.post('/api/auth/verify-email', async (req, res) => {
  const parsed = verifyEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'A verification token is required.' });
  }

  const tenant = await prisma.tenant.findFirst({
    where: { verificationToken: parsed.data.token },
  });

  if (!tenant || !tenant.verificationTokenExpires || tenant.verificationTokenExpires < new Date()) {
    return res.status(400).json({ ok: false, error: 'This verification link is invalid or has expired.' });
  }

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      emailVerifiedAt: new Date(),
      verificationToken: null,
      verificationTokenExpires: null,
    },
  });

  res.json({ ok: true });
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass (7 total).

- [ ] **Step 6: Commit**

```bash
git add platform/api
git commit -m "Add email verification with dev-mode sender"
```

---

## Task 5: Login, logout, session middleware

**Files:**
- Create: `platform/api/src/auth/session.ts`
- Create: `platform/api/src/middleware/requireTenantAuth.ts`
- Modify: `platform/api/src/routes/auth.ts`
- Modify: `platform/api/src/app.ts`
- Test: `platform/api/tests/auth.test.ts`

**Interfaces:**
- Consumes: `verifyPassword` (Task 3), `Session` model (Task 2), `env.sessionCookieName` (Task 1).
- Produces: `createSession(subjectType: 'tenant' | 'platform_admin', subjectId: string): Promise<{ token: string; expiresAt: Date }>`, `destroySession(token: string): Promise<void>`, `getSession(token: string): Promise<{ subjectType: string; subjectId: string } | null>` from `src/auth/session.ts` — Task 7 and all future authenticated routes depend on these exact names.
- Produces: Express middleware `requireTenantAuth` that attaches `req.tenantId: string` when authenticated, else responds `401`.
- Produces: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` routes.

- [ ] **Step 1: Create `src/auth/session.ts`**

```typescript
import crypto from 'node:crypto';
import { prisma } from '../db/client.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function createSession(subjectType: 'tenant' | 'platform_admin', subjectId: string) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { token, subjectType, subjectId, expiresAt },
  });
  return { token, expiresAt };
}

export async function destroySession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token } });
}

export async function getSession(token: string): Promise<{ subjectType: string; subjectId: string } | null> {
  const session = await prisma.session.findUnique({ where: { token } });
  if (!session || session.expiresAt < new Date()) {
    return null;
  }
  return { subjectType: session.subjectType, subjectId: session.subjectId };
}
```

- [ ] **Step 2: Create `src/middleware/requireTenantAuth.ts`**

```typescript
import type { Request, Response, NextFunction } from 'express';
import { env } from '../env.js';
import { getSession } from '../auth/session.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenantId?: string;
    }
  }
}

export async function requireTenantAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[env.sessionCookieName];
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Log in to continue.' });
  }

  const session = await getSession(token);
  if (!session || session.subjectType !== 'tenant') {
    return res.status(401).json({ ok: false, error: 'Log in to continue.' });
  }

  req.tenantId = session.subjectId;
  next();
}
```

- [ ] **Step 3: Write the failing tests — append to `tests/auth.test.ts`**

```typescript
async function registerAndVerify(app: ReturnType<typeof buildApp>, email: string) {
  await request(app).post('/api/auth/register').send({
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email,
    password: 'correct horse battery staple',
  });
  const tenant = await prisma.tenant.findUnique({ where: { email } });
  await request(app).post('/api/auth/verify-email').send({ token: tenant?.verificationToken });
}

test('POST /api/auth/login sets a session cookie for correct credentials', async () => {
  const app = buildApp();
  await registerAndVerify(app, 'jane@acmeprints.co.za');

  const res = await request(app).post('/api/auth/login').send({
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  const setCookie = res.headers['set-cookie']?.[0] ?? '';
  assert.match(setCookie, /barkie_session=/);
  assert.match(setCookie, /HttpOnly/);
});

test('POST /api/auth/login rejects the wrong password', async () => {
  const app = buildApp();
  await registerAndVerify(app, 'jane@acmeprints.co.za');

  const res = await request(app).post('/api/auth/login').send({
    email: 'jane@acmeprints.co.za',
    password: 'wrong password entirely',
  });

  assert.equal(res.status, 401);
  assert.equal(res.body.ok, false);
});

test('GET /api/auth/me returns the tenant when logged in, 401 otherwise', async () => {
  const app = buildApp();
  await registerAndVerify(app, 'jane@acmeprints.co.za');
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  });

  const authed = await agent.get('/api/auth/me');
  assert.equal(authed.status, 200);
  assert.equal(authed.body.tenant.email, 'jane@acmeprints.co.za');

  const anonymous = await request(app).get('/api/auth/me');
  assert.equal(anonymous.status, 401);
});

test('POST /api/auth/logout clears the session', async () => {
  const app = buildApp();
  await registerAndVerify(app, 'jane@acmeprints.co.za');
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  });

  await agent.post('/api/auth/logout');
  const res = await agent.get('/api/auth/me');
  assert.equal(res.status, 401);
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `/api/auth/login`, `/api/auth/me`, `/api/auth/logout` all 404.

- [ ] **Step 5: Add routes — append to `src/routes/auth.ts`**

Add these imports at the top:
```typescript
import { verifyPassword } from '../auth/password.js';
import { createSession, destroySession } from '../auth/session.js';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { env } from '../env.js';
```

Append to the bottom of the file:
```typescript
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

authRouter.post('/api/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Enter your email and password.' });
  }

  const tenant = await prisma.tenant.findUnique({ where: { email: parsed.data.email } });
  const valid = tenant ? await verifyPassword(parsed.data.password, tenant.passwordHash) : false;
  if (!tenant || !valid) {
    return res.status(401).json({ ok: false, error: 'Incorrect email or password.' });
  }

  const { token, expiresAt } = await createSession('tenant', tenant.id);
  res.cookie(env.sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    expires: expiresAt,
  });
  res.json({ ok: true });
});

authRouter.post('/api/auth/logout', async (req, res) => {
  const token = req.cookies?.[env.sessionCookieName];
  if (token) {
    await destroySession(token);
  }
  res.clearCookie(env.sessionCookieName);
  res.json({ ok: true });
});

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

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass (11 total).

- [ ] **Step 7: Commit**

```bash
git add platform/api
git commit -m "Add login, logout, and session-authenticated /me endpoint"
```

---

## Task 6: Tenant-scoped query wrapper

**Files:**
- Create: `platform/api/src/db/scoped.ts`
- Test: `platform/api/tests/tenant-isolation.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2), `Customer` model fields (Task 2).
- Produces: `tenantScope(tenantId: string)` from `src/db/scoped.ts`, returning `{ customers: { findMany, findById, create, update } }`. Task 7's routes call only this — never `prisma.customer` directly.

- [ ] **Step 1: Write the failing test — `tests/tenant-isolation.test.ts`**

```typescript
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';
import { hashPassword } from '../src/auth/password.js';
import { tenantScope } from '../src/db/scoped.js';

beforeEach(resetTestDatabase);

async function makeTenant(email: string) {
  return prisma.tenant.create({
    data: {
      businessName: 'Test Co',
      contactName: 'Test Person',
      email,
      passwordHash: await hashPassword('irrelevant password value'),
    },
  });
}

test('a tenant cannot see another tenant\'s customers', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  await scopedA.customers.create({ name: 'Alice Customer', billingAddress: '1 Main Rd' });
  await scopedB.customers.create({ name: 'Bob Customer', billingAddress: '2 Side St' });

  const aList = await scopedA.customers.findMany();
  const bList = await scopedB.customers.findMany();

  assert.equal(aList.length, 1);
  assert.equal(aList[0].name, 'Alice Customer');
  assert.equal(bList.length, 1);
  assert.equal(bList[0].name, 'Bob Customer');
});

test('findById returns null for a customer belonging to a different tenant', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  const created = await scopedA.customers.create({ name: 'Alice Customer', billingAddress: '1 Main Rd' });

  const foundByOwner = await scopedA.customers.findById(created.id);
  const foundByOther = await scopedB.customers.findById(created.id);

  assert.ok(foundByOwner);
  assert.equal(foundByOther, null);
});

test('update only affects the owning tenant\'s row', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  const created = await scopedA.customers.create({ name: 'Alice Customer', billingAddress: '1 Main Rd' });

  const otherTenantResult = await scopedB.customers.update(created.id, { notes: 'hijacked' });
  assert.equal(otherTenantResult.count, 0);

  const ownerResult = await scopedA.customers.update(created.id, { notes: 'legit update' });
  assert.equal(ownerResult.count, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `../src/db/scoped.js`.

- [ ] **Step 3: Create `src/db/scoped.ts`**

```typescript
import { prisma } from './client.js';

export interface CreateCustomerInput {
  name: string;
  billingAddress: string;
  company?: string;
  email?: string;
  phone?: string;
  deliveryAddress?: string;
  vatNumber?: string;
  notes?: string;
}

export interface UpdateCustomerInput {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  billingAddress?: string;
  deliveryAddress?: string;
  vatNumber?: string;
  notes?: string;
}

export function tenantScope(tenantId: string) {
  return {
    customers: {
      findMany: () => prisma.customer.findMany({ where: { tenantId } }),

      findById: (id: string) => prisma.customer.findFirst({ where: { id, tenantId } }),

      create: (data: CreateCustomerInput) =>
        prisma.customer.create({ data: { ...data, tenantId } }),

      update: (id: string, data: UpdateCustomerInput) =>
        prisma.customer.updateMany({ where: { id, tenantId }, data }),
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass (14 total).

- [ ] **Step 5: Commit**

```bash
git add platform/api
git commit -m "Add tenant-scoped query wrapper, proven against cross-tenant access"
```

---

## Task 7: Customer CRUD endpoints

**Files:**
- Create: `platform/api/src/routes/customers.ts`
- Modify: `platform/api/src/app.ts`
- Test: `platform/api/tests/customers.test.ts`

**Interfaces:**
- Consumes: `tenantScope` (Task 6), `requireTenantAuth` (Task 5).
- Produces: `GET /api/customers`, `POST /api/customers`, `GET /api/customers/:id`, `PATCH /api/customers/:id` — all behind `requireTenantAuth`.

- [ ] **Step 1: Write the failing test — `tests/customers.test.ts`**

```typescript
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';

beforeEach(resetTestDatabase);

async function loggedInAgent(app: ReturnType<typeof buildApp>) {
  const email = 'jane@acmeprints.co.za';
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

test('customer endpoints require auth', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/customers');
  assert.equal(res.status, 401);
});

test('POST /api/customers rejects a missing required field', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const res = await agent.post('/api/customers').send({ name: 'No Address Co' });
  assert.equal(res.status, 400);
});

test('full create -> list -> get -> update cycle', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const createRes = await agent.post('/api/customers').send({
    name: 'Print Buyer CC',
    billingAddress: '5 Oak Ave, Centurion',
  });
  assert.equal(createRes.status, 201);
  const customerId = createRes.body.customer.id;

  const listRes = await agent.get('/api/customers');
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.customers.length, 1);

  const getRes = await agent.get(`/api/customers/${customerId}`);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.customer.name, 'Print Buyer CC');

  const updateRes = await agent
    .patch(`/api/customers/${customerId}`)
    .send({ notes: 'Prefers matte finish' });
  assert.equal(updateRes.status, 200);

  const getAfterUpdate = await agent.get(`/api/customers/${customerId}`);
  assert.equal(getAfterUpdate.body.customer.notes, 'Prefers matte finish');
});

test('GET /api/customers/:id returns 404 for another tenant\'s customer', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app);

  await request(app).post('/api/auth/register').send({
    businessName: 'Other Shop',
    contactName: 'Bob Doe',
    email: 'bob@othershop.co.za',
    password: 'correct horse battery staple',
  });
  const tenantB = await prisma.tenant.findUnique({ where: { email: 'bob@othershop.co.za' } });
  await request(app).post('/api/auth/verify-email').send({ token: tenantB?.verificationToken });
  const agentB = request.agent(app);
  await agentB.post('/api/auth/login').send({ email: 'bob@othershop.co.za', password: 'correct horse battery staple' });

  const createRes = await agentA.post('/api/customers').send({
    name: 'Print Buyer CC',
    billingAddress: '5 Oak Ave, Centurion',
  });

  const res = await agentB.get(`/api/customers/${createRes.body.customer.id}`);
  assert.equal(res.status, 404);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — all `/api/customers` requests 404.

- [ ] **Step 3: Create `src/routes/customers.ts`**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { tenantScope } from '../db/scoped.js';

export const customersRouter = Router();
customersRouter.use(requireTenantAuth);

const createCustomerSchema = z.object({
  name: z.string().min(1),
  billingAddress: z.string().min(1),
  company: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  deliveryAddress: z.string().optional(),
  vatNumber: z.string().optional(),
  notes: z.string().optional(),
});

const updateCustomerSchema = createCustomerSchema.partial();

customersRouter.get('/api/customers', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const customers = await scoped.customers.findMany();
  res.json({ ok: true, customers });
});

customersRouter.post('/api/customers', async (req, res) => {
  const parsed = createCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Customer name and billing address are required.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const customer = await scoped.customers.create(parsed.data);
  res.status(201).json({ ok: true, customer });
});

customersRouter.get('/api/customers/:id', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const customer = await scoped.customers.findById(req.params.id);
  if (!customer) {
    return res.status(404).json({ ok: false, error: 'Customer not found.' });
  }
  res.json({ ok: true, customer });
});

customersRouter.patch('/api/customers/:id', async (req, res) => {
  const parsed = updateCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid customer fields.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const result = await scoped.customers.update(req.params.id, parsed.data);
  if (result.count === 0) {
    return res.status(404).json({ ok: false, error: 'Customer not found.' });
  }
  res.json({ ok: true });
});
```

- [ ] **Step 4: Wire the router into `src/app.ts`**

Add the import:
```typescript
import { customersRouter } from './routes/customers.js';
```

Add after `app.use(authRouter);`:
```typescript
  app.use(customersRouter);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass (18 total).

- [ ] **Step 6: Commit**

```bash
git add platform/api
git commit -m "Add Customer CRUD endpoints behind tenant auth"
```

---

## Task 8: Rate limiting on auth endpoints

**Files:**
- Modify: `platform/api/src/routes/auth.ts`
- Test: `platform/api/tests/auth.test.ts`

**Interfaces:**
- Consumes: nothing new — wraps existing routes from Task 3/5.
- Produces: no new exports; `POST /api/auth/login` and `POST /api/auth/register` return `429` after the configured limit.

- [ ] **Step 1: Write the failing test — append to `tests/auth.test.ts`**

```typescript
test('POST /api/auth/login is rate-limited after repeated failures', async () => {
  const app = buildApp();
  await registerAndVerify(app, 'jane@acmeprints.co.za');

  let lastStatus = 0;
  for (let i = 0; i < 12; i++) {
    const res = await request(app).post('/api/auth/login').send({
      email: 'jane@acmeprints.co.za',
      password: 'wrong password entirely',
    });
    lastStatus = res.status;
  }

  assert.equal(lastStatus, 429);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — last status is 401, not 429 (no limiter yet).

- [ ] **Step 3: Add rate limiting — modify `src/routes/auth.ts`**

Add this import at the top:
```typescript
import rateLimit from 'express-rate-limit';
```

Add this above the route definitions (after the imports, before `registerSchema`):
```typescript
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
```

Change the register and login route signatures to include the limiter as
middleware — e.g.:
```typescript
authRouter.post('/api/auth/register', authLimiter, async (req, res) => {
```
```typescript
authRouter.post('/api/auth/login', authLimiter, async (req, res) => {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass (19 total).

Note: this test makes 12 real requests per run — expect the whole suite to
take a bit longer than earlier tasks. If it becomes annoying in future
plans, come back and inject a fake clock; not needed yet (YAGNI).

- [ ] **Step 5: Commit**

```bash
git add platform/api
git commit -m "Rate-limit auth endpoints against brute-force attempts"
```

---

## Self-Review Notes

- **Spec coverage**: SRS §4.1 (sign-up, email verification, login, password
  hashing) — Tasks 3–5. SRS §4.5 (customer fields, one per line item in the
  spec) — Task 2 schema + Task 7 routes. Tenant isolation (implicit
  requirement of the whole multi-tenant design) — Task 6, directly tested.
  Not yet covered by this plan (intentionally — later plans): password
  reset, 2FA, platform-admin login/routes, all other domain modules
  (printers, filament, labour, consumables, costing, quotes/invoices, shop
  profile, material selector, Kanban jobs).
- **Placeholder scan**: no TBD/TODO markers; the one deliberately deferred
  piece (real email delivery) is a fully-working dev-mode implementation
  behind a stable function signature, not an unfinished stub.
- **Type consistency**: `tenantScope(tenantId)` used identically in Task 6's
  tests and Task 7's routes; `CreateCustomerInput`/`UpdateCustomerInput`
  field names match the Prisma `Customer` model from Task 2 exactly;
  `createSession`/`destroySession`/`getSession` signatures from Task 5 match
  their use in `requireTenantAuth.ts`.

---

Plan complete and saved to `docs/superpowers/plans/2026-09-06-platform-foundation.md`.
