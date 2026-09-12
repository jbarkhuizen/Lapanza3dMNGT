# Feature Request Board — Design Spec

**Source:** competitor reference screenshot ("Feature Requests" — submit a request, "My requests", community voting/upcoming board).

**Goal:** Tenants can submit feature ideas, see their own submissions' status, and upvote/browse what other tenants have requested — a lightweight public-within-the-platform roadmap board.

## Scope decision

The reference shows comment counts on community requests ("0 comments", "1 comment"). **Skip comments for this pass** — voting and status tracking deliver most of the value; a full threaded-comment system is a separable feature. Also skip admin-side request triage UI (approving/rejecting/labeling requests) beyond a plain `status` field a platform admin can set directly via a script/future admin-center page — this spec is the tenant-facing submit/vote/browse surface only, not a full internal triage workflow.

Requests are visible **across all tenants** (a shared roadmap, not tenant-private) — that's the entire point of "Community requests." This is the first tenant-facing feature in this codebase where one tenant's data (a submitted request) is deliberately visible to other tenants; be precise about what's shared (title, description, category, vote count, status) versus what stays private (nothing here is actually private, but do not expose which tenant/customer submitted a request — show it anonymously, matching the reference's lack of any submitter identity in the community list).

## Data model

New models in `platform/api/prisma/schema.prisma`:

```prisma
model FeatureRequest {
  id          String   @id @default(uuid())
  tenantId    String
  category    String
  title       String
  description String
  status      String   @default("new")
  createdAt   DateTime @default(now()) @db.Timestamptz(3)

  tenant Tenant               @relation(fields: [tenantId], references: [id])
  votes  FeatureRequestVote[]

  @@index([tenantId])
  @@map("feature_requests")
}

model FeatureRequestVote {
  id               String   @id @default(uuid())
  featureRequestId String
  tenantId         String
  createdAt        DateTime @default(now()) @db.Timestamptz(3)

  featureRequest FeatureRequest @relation(fields: [featureRequestId], references: [id])
  tenant         Tenant         @relation(fields: [tenantId], references: [id])

  @@unique([featureRequestId, tenantId])
  @@map("feature_request_votes")
}
```

`category`: `'new_feature' | 'workflow' | 'bug'` (the reference shows "New Feature"/"Workflow" badges — pick a small closed set rather than free text, matching how this schema always constrains category-like fields). `status`: `'new' | 'planned' | 'in_progress' | 'done' | 'declined'`. The `@@unique([featureRequestId, tenantId])` on the vote table is what prevents a tenant voting twice on the same request — rely on that DB constraint (catch its `P2002` and treat as "already voted", don't pre-check-then-insert).

Add inverse relations: `featureRequests FeatureRequest[]` and `featureRequestVotes FeatureRequestVote[]` on `Tenant`.

## Backend

**`platform/api/src/db/scoped.ts`** — add a `featureRequests` accessor: `findMyRequests()` (tenant-scoped, this tenant's own submissions), `findAll(sort: 'votes' | 'recent')` (**not** tenant-scoped — every tenant's requests, since this is the shared community list; still lives under `tenantScope()` for consistency with the rest of this file even though its query doesn't filter by `tenantId`, with a comment explaining why), `create(data)`, `vote(featureRequestId)` (creates a `FeatureRequestVote` row for the current tenant, catches `P2002` → returns a "already voted" signal rather than throwing), `unvote(featureRequestId)`.

**`platform/api/src/routes/feature-requests.ts`** (new router, mounted in `app.ts`):
- `POST /api/feature-requests` — `requireTenantAuth, requireActiveSubscription`. Body: `category`, `title` (`z.string().trim().min(1).max(120)`), `description` (`z.string().trim().min(1).max(2000)`).
- `GET /api/feature-requests/mine` — this tenant's own submissions with their status.
- `GET /api/feature-requests` — `?sort=votes|recent` (default `votes`). Returns every tenant's requests **without exposing which tenant submitted each one** — the select/serializer must omit `tenantId` from the response entirely, and must include this tenant's own vote count and whether *this* tenant has already voted on each (a per-request `hasVoted: boolean`, computed via a left join / separate query against `FeatureRequestVote` filtered to the current tenant).
- `POST /api/feature-requests/:id/vote` — toggles: if this tenant hasn't voted, create the vote; if they have, remove it (so the button in the UI is a toggle, matching the reference's up-arrow-that-shows-a-count control). Return the new vote count and `hasVoted` state.

## Frontend (`platform/frontend`)

**`platform/frontend/src/api/featureRequests.ts`** (new) — `FeatureRequest` interface, `useSubmitFeatureRequest()`, `useMyFeatureRequests()`, `useCommunityFeatureRequests(sort)`, `useToggleFeatureRequestVote(id)`.

**`platform/frontend/src/pages/featureRequests/FeatureRequestsPage.tsx`** (new) — three sections matching the reference: "Submit a request" (category select, title, description, submit button), "My requests" (this tenant's own list with status badges, empty state "No requests yet"), "Community requests" (sorted list with a vote button/count per row, a Vote/Upcoming toggle — "Upcoming" can just mean `status != 'new'`, i.e. anything already acknowledged/planned, filtered client-side from the same fetched list rather than a second API mode unless that turns out awkward).

**`platform/frontend/src/App.tsx`** — route `/feature-requests` inside `RequireAuth`.

**`platform/frontend/src/components/AppShell.tsx`** — add `{ to: '/feature-requests', label: 'Feature Requests' }` to `NAV_ITEMS`.

## Tests

- `platform/api/tests/feature-requests.test.ts` (new): auth required; submit + appears in `mine`; community list excludes `tenantId` from the response shape (assert the key is absent, not just unused); voting toggles correctly (vote → unvote → vote again, count tracks); a second vote attempt from the same tenant via a raw duplicate-insert path (simulating a race) is handled as "already voted," not a 500; sort=votes orders by vote count descending.
- `platform/frontend/tests/FeatureRequestsPage.test.tsx` (new): submit flow, my-requests list, community list with vote toggle.

## Global constraints

- The community list route is the one place in this codebase where a "tenant-scoped" accessor deliberately returns cross-tenant data — document this clearly at the call site so a future reader doesn't assume it's a scoping bug.
- Never leak `tenantId` (or anything else identifying the submitter) in the community-list response.
- No comments/threaded replies, no admin triage UI, in this pass.
