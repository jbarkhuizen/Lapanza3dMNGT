# Mobile App Strategy — Android, iOS & Huawei AppGallery

**Status:** Analysis / recommendation only — no code written. For discussion before committing to a build.

## Context

Barkie's platform frontend is a React 18 + TypeScript SPA (Vite build, React Router, Tailwind) talking to an Express/Prisma REST API. There is no existing native app, no push infrastructure, and no offline story today. This document evaluates how to bring Barkie to phones.

## What a mobile app would actually be used for

Before picking a stack, worth being explicit about the job: this is a small-business back-office tool (quotes, job cards, invoices, printer/filament inventory), not a consumer app. The realistic mobile use cases are:
- Checking/updating job card status from the shop floor
- Approving/sending a quote while away from a desk
- Getting push notifications for new orders, payment received, low filament stock
- Quick customer lookups

It is *not* a camera-first, gesture-heavy, animation-heavy app. That matters a lot for the stack decision below — it shifts weight toward "wrap the web app well" and away from "needs a fully native UI".

## Four approaches

### 1. Capacitor (wrap the existing React app) — recommended starting point

[Capacitor](https://capacitorjs.com/) (from the Ionic team) takes the existing `platform/frontend` build and packages it into a real native shell — a genuine installable `.apk`/`.aab` and `.ipa`, not just a bookmarked website. It runs the same React/Vite app inside a native WebView, and exposes native device APIs (push notifications, camera, filesystem, biometric unlock, share sheet) to it via JS plugins.

**Why it fits Barkie specifically:** the app is form-and-table heavy, not animation-heavy, so WebView performance is a non-issue. The entire existing component library, routing, auth flow, and API integration carry over unchanged — this is genuinely close to zero frontend rewrite. New work is mostly: a thin native shell project per platform, a splash/icon set, push notification wiring, and responsive polish for phone-sized viewports (already underway — see the AppShell mobile nav work shipped in this session).

**Effort estimate:** 1–2 weeks for a first Android+iOS build with push notifications, assuming the API already exposes what's needed (see "Backend work" below). Huawei AppGallery adds roughly another 3–5 days (see Huawei section).

**Tradeoffs:** it's still a WebView under the hood — no native animations/gestures, and Apple has (rarely, but not never) pushed back on WebView-wrapped apps that feel too "thin." For a genuine back-office tool this is low risk; App Store review guideline 4.2 is aimed at apps that are literally just a website with no native affordance (push, offline cache, device integration) — adding push notifications and an offline-capable shell addresses that directly.

### 2. React Native (rewrite UI, share business logic)

Rewrite the UI layer in React Native while keeping the same team's React/TypeScript skillset and reusing API client code, types, and business logic (anything not JSX). Produces genuinely native UI components (native `<ScrollView>`, native navigation transitions, etc.) instead of a WebView.

**Tradeoffs:** every page (job cards, quotes, invoices, printers, filaments, team, etc. — 15+ list pages) needs its UI rebuilt against React Native primitives instead of Tailwind/HTML. That's a real rewrite, not a wrap — realistically 2–3 months for feature parity with the web app, competing with ongoing web feature work on the same small team. Only worth it if native look-and-feel or native-only capability (e.g. background location, complex gestures) becomes a hard requirement — nothing in the current feature set demands that.

### 3. Fully native (Kotlin/Swift, separate codebases)

Best possible platform-native quality, but doubles the maintenance surface (two UI codebases plus the web app) for a small team already running lean. Not recommended for a business-tooling app with this usage profile — the cost only pays off for apps where native feel is the product itself (games, camera-first apps, apps competing on polish). Barkie isn't that.

### 4. PWA only (no app-store presence)

Add a web manifest + service worker to the existing frontend so it's installable from the browser ("Add to Home Screen") with an app icon and offline shell, but never published to Google Play / App Store / AppGallery. Cheapest option (a few days) and gets most of the "feels like an app" benefit on Android, where PWA install support is strong. Weak on iOS (Safari's PWA support is more limited — no push notifications until fairly recently, and inconsistent), and PWAs cannot be listed in Huawei AppGallery at all, which matters if Huawei-device customers are a real segment.

## Recommendation

**Capacitor**, built on top of the frontend work already shipped this session (mobile-responsive AppShell, off-canvas nav, table overflow handling) — that responsiveness work was a direct prerequisite for this path and is already done. This gets real app-store presence on all three platforms fastest, with the least duplicated code, and the app's actual usage pattern (forms, tables, notifications) doesn't need what a rewrite would buy.

Revisit React Native only if usage data later shows people want a much richer mobile-native experience than the wrapped web app delivers.

## Huawei AppGallery — what's different

Huawei devices sold after mid-2019 (the US trade restrictions) ship without Google Mobile Services (GMS) — no Play Store, no Firebase Cloud Messaging, no Google Maps SDK, etc. Two implications for Barkie:

1. **Distribution:** the app must be submitted separately to Huawei AppGallery Connect (separate developer account, separate review process, separate build target). Capacitor doesn't change this — it's a packaging/submission step, not a code fork, as long as nothing in the app hard-depends on GMS.
2. **Push notifications:** Firebase Cloud Messaging (the default push provider on Android) doesn't work on GMS-less Huawei devices. Huawei's alternative is **HMS Push Kit**. Practically, this means either (a) integrate both FCM and HMS Push Kit behind a single notification-plugin interface with a runtime check for which services are available, or (b) skip push on Huawei devices for v1 and rely on in-app notification badges + polling. Given Huawei's device share is a minority of the target market (small SA businesses), (b) is a reasonable v1 scope-cut — ship Android+iOS with push first, add HMS Push Kit as a fast-follow if Huawei users actually show up in analytics.
3. **Maps/location:** not currently a Barkie feature, but flagging it — if delivery-route or location features are ever added, Google Maps SDK needs a Huawei Map Kit equivalent.

Net effect: Huawei support is achievable without a separate codebase, but it's not "free" — budget the extra AppGallery submission + HMS Push Kit integration as explicit scope, not an afterthought.

## Backend work needed (regardless of chosen approach)

- **Push notification endpoint(s):** device token registration (`POST /api/devices` or similar) tied to `tenantId`/`teamMemberId`, plus a notification-dispatch path from whatever already triggers in-app events (new order, payment webhook, low-stock threshold) to also call FCM/HMS/APNs. The existing `Notification` model (referenced in the webhook tests fixed earlier this session) is a natural hook point.
- **Session/auth over long-lived mobile sessions:** current cookie-based session (`barkie_session`) works fine inside a Capacitor WebView (it's still a real browser context), but token lifetime/refresh behavior should be reviewed for a "stays logged in for weeks" mobile usage pattern rather than the shorter-lived expectations of a desktop browser tab.
- **API rate limits** (`loginLimiter`, `accountLimiter` in `auth.ts`) are already IP-based — worth a quick check that they behave sanely behind mobile carrier NAT (many users sharing one egress IP), though this is a pre-existing concern independent of the mobile app.

## Suggested next step

If this direction looks right: scope a small first milestone — Capacitor shell + Android build + basic push (order-created, payment-received) — as its own spec/plan, separate from ongoing web feature work, following the usual brainstorm → spec → plan flow before any code is written.
