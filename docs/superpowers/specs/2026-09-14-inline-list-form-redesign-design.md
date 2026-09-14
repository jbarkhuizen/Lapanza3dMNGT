# Inline List/Add/Edit Redesign

## Summary

Replace the current "list page → navigate to a separate blank page to add or edit" pattern (used identically across 9 simple CRUD resources) with an always-visible inline add form and inline edit-in-place, so adding or editing an item never navigates away from the list.

## Background / motivation

Every simple resource page (Filaments, Customers, Labour Steps, Consumables, Printers, Scanners, Laser Materials, Premade Items, Products) follows the same shape today: a list page with a "New X" link that routes to `/resource/new`, a large mostly-empty full-page form, and editing an existing item routes to `/resource/:id`, another full page. The user's own words: clicking it "provides me with a large open space and only one... it allows me to add an item... that feels so old-school." The fix: keep the add and edit actions on the list page itself.

`materials/` (the read-only Materials Library) is excluded — it's a global reference catalogue, not a tenant-owned CRUD resource, and follows a completely different pattern already.

## Scope decision

All 9 resources in this round: Filaments, Customers, Labour Steps, Consumables, Printers, Scanners, Laser Materials, Premade Items, Products. They all share the same underlying shape (a list + a form with required and optional fields), so building the pattern once and applying it 9 times is more consistent than doing one or two now and the rest later.

## The essentials / details rule

Established by inspecting all 9 resources' actual field lists: **the always-visible inline add row shows exactly the form's required fields; a "+ More details" toggle (collapsed by default) reveals the optional fields.** This isn't a per-resource judgment call — it falls directly out of each resource's existing required/optional field split, which is already enforced server-side by each route's zod schema.

Resources with zero or only one optional field (Labour Steps: name + hourlyRate, both required; Scanners: name/scannerCost/expectedScanHours required + powerCostPerHour optional; Laser Materials and Premade Items similarly small) end up with everything visible inline all the time — no toggle appears when there's nothing to hide behind it.

Filaments and Printers are the two field-heavy cases (12 fields each) where the toggle actually matters, and were used to validate the pattern first (see "Rollout order").

## Architecture

- **One page per resource, not two.** `FilamentsListPage.tsx` absorbs everything `FilamentFormPage.tsx` currently does. `FilamentFormPage.tsx` (and the equivalent for every other resource) is deleted.
- **Routing**: `/filaments` renders the merged list+add+edit page. `/filaments/new` is removed (redundant — the add row is always there). `/filaments/:id` is kept as a deep-link fallback: it renders the same list page component, reads `:id` on mount, auto-expands that row into edit mode, and scrolls it into view.
- **Two new shared components** (`platform/frontend/src/components/`), layout/behavior only — no generic form-building, each resource still owns its own field markup, types, and validation, exactly as today:
  - **`MoreDetailsToggle`**: wraps a block of optional-field inputs. Starts collapsed. Renders nothing (no toggle control at all) when it has no children, so resources with no optional fields render no toggle.
  - **`InlineEditableRow`**: wraps a `<tr>`. Takes `isEditing`, the read-only row content, and the editable form content (same field markup as the add form, pre-filled from the row's current values) as props; renders one or the other. Owns no state itself — the parent list page's `editingId` drives it.
- **State**: each list page adds one local `editingId: string | null` (which row, if any, is currently expanded for edit — `null` means none) alongside its existing add-form state (already present in every current `FormPage`, just relocated). No global state, no new libraries, no routing library changes beyond removing the two routes per resource.
- **Printers exception**: its edit-mode expansion additionally renders the existing `PresetsSection`/`MaintenanceLogSection` (only meaningful once the printer exists) inside the expanded row — so its expanded row is taller than the others', not smaller. Everything else about the pattern is identical.

## Data flow

1. **List load**: unchanged — same `useResource()` query hook per page as today.
2. **Add**: essentials inputs are local state on the list page (mirrors today's `FilamentFormPage`'s `form` state, just moved). Submitting calls the existing `useCreateResource()` mutation, which already invalidates the list query on success — the new row appears in the table without a manual refetch. On error, the existing inline error message renders next to the add row (same `ApiError`/message pattern `FormField` already uses).
3. **Edit**: clicking a row's Edit control sets `editingId` to that row's id; `InlineEditableRow` swaps to its form view, pre-filled from the row's current data (no separate fetch needed — the data's already in the list query's cache). Save calls the existing `useUpdateResource(id)` mutation; Cancel just resets `editingId` to `null` without calling anything.
4. **Deep link**: visiting `/filaments/:id` directly triggers the same flow as clicking that row's Edit control, run once on mount via a `useEffect` keyed on the route param.
5. **Delete** (where it exists today — Scanners, Laser Materials, Premade Items, Products): unchanged, carried over into the new row markup as-is. Not in scope for this redesign.

## Testing

Each resource's existing test file (`FilamentsListPage.test.tsx`, etc.) is extended to cover, in place of the deleted `FilamentFormPage.test.tsx`:
- Adding via the always-visible essentials-only form (no "More details" expansion).
- Adding via the expanded "More details" section, for resources that have one.
- Editing a row in place: Edit → fields pre-filled → Save → row reflects new values, `editingId` resets to `null`.
- Cancel: Edit → change a field → Cancel → row reverts to original display, no mutation call made.
- The `/filaments/:id` deep link: navigating directly to it auto-expands the correct row.

For resources with no optional fields (Labour Steps, Scanners, Laser Materials, Premade Items), the "no toggle renders" behavior gets its own explicit test — a regression here (a toggle appearing with nothing inside it) would be an easy design mistake to reintroduce later without one.

## Rollout order

Filaments first — the worst case (12 fields, both essentials/details split and the deep-link behavior genuinely exercised). Once that's confirmed working end-to-end, the remaining 8 resources follow in any order, since each is a subset of the same shape already proven on Filaments. Each resource is independently testable and mergeable — none blocks on another.

## Out of scope for this round

- Dark mode (separate spec, separate initiative — see the brainstorming conversation this spec came out of).
- Delete-flow UX changes (carried over as-is).
- Any change to the Materials Library (`materials/` — different pattern, not a CRUD resource).
- A generic/schema-driven form abstraction — each resource keeps hand-written fields, matching this codebase's existing convention.
