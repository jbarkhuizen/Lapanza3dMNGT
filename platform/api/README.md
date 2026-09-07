# Barkie Platform API

The tenant-facing platform API: registration, email verification, cookie-session
auth, tenant-scoped data access, and Customer CRUD.

## Prerequisites

- **Node 20+**. Note: `npm test` relies on Node's own `--test` glob support
  for `tests/**/*.test.ts`, which needs **Node 21.7+ / 22+** — on Node 20
  the pattern isn't expanded and `npm test` reports no test files found.
- **PostgreSQL 14+** running locally.

## One-time setup

1. Create a `barkie` Postgres role and two databases it owns:

   ```sql
   CREATE ROLE barkie WITH LOGIN PASSWORD 'barkie';
   CREATE DATABASE barkie_dev OWNER barkie;
   CREATE DATABASE barkie_test OWNER barkie;
   ```

2. Copy the env samples and adjust `DATABASE_URL` if your local Postgres
   setup (user, password, host, port) differs from the defaults:

   ```sh
   cp env.sample .env
   cp env.test.sample .env.test
   ```

3. Run migrations against both databases:

   ```sh
   npx prisma migrate deploy
   npm run migrate:test
   ```

   (The first command reads `DATABASE_URL` from `.env` via Prisma's default
   dotenv loading; `migrate:test` points it at `.env.test` instead. Note:
   `node_modules/.bin/prisma` is a POSIX shell shim, not JavaScript — running
   it directly via `node` fails on Windows. `migrate:test` calls Prisma's
   actual JS entrypoint instead, so it works cross-platform.)

## Common commands

```sh
npm install       # install dependencies
npm run dev       # run the API with auto-reload (tsx watch)
npm test          # run the test suite against barkie_test
npm run typecheck # run tsc --noEmit over src/ and tests/
```

## Creating new migrations

`npx prisma migrate deploy` (used above) only applies existing migrations —
it does not need elevated privileges. If you need to run `npx prisma migrate
dev` to author a **new** migration, the `barkie` role needs the Postgres
`CREATEDB` privilege (`ALTER ROLE barkie CREATEDB;`), since `migrate dev`
creates a shadow database to compute the diff.
