# Barkie

A multi-tenant SaaS platform for small 3D-printing businesses to manage
customers, printers, filament, job costing, and quotes/invoices — in
exchange for a recurring subscription. Working title; final name/domain
still to be confirmed (see backlog).

**If you're an AI assistant picking this project up cold, read
[`docs/AI_HANDOFF.md`](docs/AI_HANDOFF.md) first.** It orients you fast —
current state, what's live vs. not, gotchas. This file is just the map.

## What's in this repo

| Folder | What it is | Status |
|---|---|---|
| [`landing/`](landing/) | Temporary holding page for barkie.co.za — Express app with an email signup | **Live** at https://barkie.co.za (deployed 2026-09-07, `barkie-landing.service` on the VPS). |
| [`platform/api/`](platform/api/) | The real product: Node/TypeScript/Express/Postgres API — auth, tenant isolation, Customer/Printer/Filament/Labour/Consumable CRUD, costing engine, Company Profile, Quotes, and Invoices | Foundation + Reference Data Modules + Costing Engine + Company Profile + Quotes + Invoices merged to `master`, pushed to GitHub. **Not yet deployed anywhere** — no server is running it. No PDF/email yet. |
| [`docs/superpowers/specs/`](docs/superpowers/specs/) | Design specs (what to build and why) | — |
| [`docs/superpowers/plans/`](docs/superpowers/plans/) | Implementation plans (task-by-task build instructions) | — |

## Backlog

Live tracker (bugs, features, tech debt, open decisions):
**https://claude.ai/code/artifact/43333269-4f57-4dd3-8e44-c72367c2525d**

## Repo / hosting

- **GitHub:** https://github.com/jbarkhuizen/Lapanza3dMNGT (`master` branch, no PR workflow so far — merges go straight in)
- **Domain:** barkie.co.za — DNS already points somewhere; nothing built here is deployed there yet
- **Target VPS:** same VPS as lapanza3d.co.za, in its own sibling folder/process — never inside the lapanza3d codebase, never touching it

## Source documents

The original requirements come from two documents outside this repo (not
committed here — they're the client-facing spec, not code):

- `S:\3d Bytes\3d Management Project\3d Management_Requirements_Specification V0.21.docx` — the confirmed SRS, authoritative for functional scope
- `S:\3d Bytes\3d Management Project\3D Print Shop Management Platform - Google Gemini.pdf` — an earlier, larger brainstorm; only specific items were pulled forward into Phase 1 (see the Phase 1 design spec)
