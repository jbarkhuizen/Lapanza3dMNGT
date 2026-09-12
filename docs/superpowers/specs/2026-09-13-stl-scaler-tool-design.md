# Online STL Scaler — Design Spec

**Source:** competitor reference screenshot ("Online STL Scaler" free public tool). Direct request to replicate as a Barkie lead-gen tool.

**Goal:** A free, no-login, entirely client-side tool on the public landing site (`landing/`) that resizes an STL file by percentage or exact millimetre dimensions and lets the visitor download the scaled result — the file is never uploaded anywhere.

## Scope decision

This is a pure static/client-side tool — no backend route, no database, no auth, matching the reference's own "runs entirely in your browser... never uploaded to us or anyone else" pledge. It belongs in `landing/public/`, in the same style as `materials.html`.

STL format: support **binary STL** (the common case — every slicer exports binary by default) at minimum; the reference also claims ASCII STL support. Implement binary STL parsing/writing yourself (it's a simple fixed-format: 80-byte header, 4-byte triangle count, then 50 bytes per triangle — 12 floats + a 2-byte attribute count). If ASCII STL support (a human-readable `solid ... facet normal ... endsolid` text format) adds meaningfully more parsing complexity than the binary path already required, ship binary-only for this pass and detect+reject ASCII input with a clear error message rather than half-implementing a fragile text parser — binary is what the overwhelming majority of real-world STL files from slicers/CAD tools already are.

## Implementation

**`landing/public/stl-scaler.html`** (new) — page shell matching `materials.html`'s header/footer and overall look (reuse `landing/public/styles.css`, extend it with whatever this page's specific layout needs — a drop zone, a result panel).

**`landing/public/js/stl-scaler.js`** (new, vanilla JS, ES module, no `innerHTML` anywhere — `document.createElement`/`.textContent`/`.appendChild` only):
- A drag-and-drop / click-to-browse file input accepting `.stl`.
- Parse the binary STL into its triangle list (each triangle: normal vector + 3 vertices, all `Float32`), reading directly from an `ArrayBuffer` via `DataView` — no library.
- Compute the model's current bounding-box dimensions (width/depth/height = X/Y/Z extents) from the parsed vertices.
- A form: either a single "Scale by percentage" input, or three "Set exact size" (width/depth/height in mm) inputs with a "keep proportions" checkbox (when checked, editing one dimension recalculates the other two using the model's original aspect ratio).
- On "Scale": multiply every vertex's X/Y/Z by the resolved per-axis factor (uniform if proportions are locked, per-axis otherwise), recompute each triangle's normal is unaffected by uniform scaling but **is** affected by non-uniform (per-axis) scaling — recompute normals in that case (cross product of the two edge vectors, normalized) rather than reusing the original normals, or the resulting file will have incorrect shading/orientation data for any per-axis (non-proportional) scale.
- Rebuild a binary STL `ArrayBuffer` from the scaled triangles (same 80+4+50×N format) and offer it as a downloadable file via a `Blob` + object URL (`<a download>` triggered programmatically) — this is a real download the user's own browser saves, not the sandboxed artifact/viewer download restriction (this is a plain static page, not a Claude artifact).
- Never send the file anywhere — everything above happens in-memory in the browser; there is no `fetch`/`XMLHttpRequest` call anywhere in this file.

**`landing/public/index.html`** (or wherever the landing site's nav/footer links live — check the existing structure) — add a link to the new tool alongside the existing Materials Guide link, if such a links section exists.

## Tests

`landing/tests/` currently only covers `materials-selector.js`'s pure logic (no DOM). Follow the same shape: extract the STL parse/scale/rebuild logic into pure functions in `landing/public/js/stl-scaler.js` that take/return typed arrays or plain objects (not DOM-coupled), and add `landing/tests/stlScaler.test.js` covering:
- Parsing a small hand-constructed binary STL buffer (e.g. a single triangle) recovers the correct vertex count and bounding box.
- Scaling by 200% doubles every coordinate.
- Setting an exact width with proportions locked scales depth/height by the same factor.
- Rebuilding a scaled STL back to a binary buffer and re-parsing it round-trips to the expected scaled vertices.
- A non-uniform (per-axis) scale produces a different (correctly recomputed) triangle normal than the original.

## Global constraints

- No `innerHTML` anywhere in `stl-scaler.js`.
- No new npm dependency in `landing/package.json` — hand-roll the binary STL read/write, it's a small fixed format.
- No network calls of any kind from this page.
