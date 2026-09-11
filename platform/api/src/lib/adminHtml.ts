export function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

// Soft-tint pill badges — copied verbatim (class names, opacities, colors)
// from the lapanza3d admin panel's own badge convention
// (admin/admin.css:430-445, 272-275, 326-328), per the explicit retrofit
// request to match its component styling closely, not just its principle.
const BADGE_CLASS: Record<string, string> = {
  // Backlog item status
  Done: 'badge published',
  Backlog: 'badge draft',
  // Backlog item priority
  Critical: 'badge priority-critical',
  High: 'badge priority-high',
  Medium: 'badge priority-medium',
  Low: 'badge priority-low',
  // Subscription status (Subscription.status literal values — lowercase,
  // matching the schema, never title-cased for this one)
  active: 'badge published',
  trialing: 'badge priority-medium',
  past_due: 'badge priority-high',
  lapsed: 'badge priority-critical',
  canceled: 'badge draft',
};

export function badge(label: string): string {
  const cls = Object.hasOwn(BADGE_CLASS, label) ? BADGE_CLASS[label] : 'badge draft';
  return `<span class="${cls}">${escapeHtml(label)}</span>`;
}

interface NavItem {
  href: string;
  label: string;
  route: string;
}

interface NavGroup {
  label: string | null;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  { label: null, items: [{ href: '/api/admin', label: 'Dashboard', route: 'dashboard' }] },
  {
    label: 'Manage',
    items: [
      { href: '/api/admin/tenants', label: 'Tenants', route: 'tenants' },
      { href: '/api/admin/plans', label: 'Plans', route: 'plans' },
      { href: '/api/admin/backlog', label: 'Backlog', route: 'backlog' },
    ],
  },
];

// Every admin page except the login screen shares this wrapper — one
// place for the sidebar, the shared stylesheet, and the escaped title.
// bodyHtml is the caller's own already-escaped-per-value HTML fragment,
// never a raw user-controlled string on its own.
//
// Styling below is a close retrofit of the lapanza3d admin panel's own
// admin.css (colors, typography, sidebar layout, component classes
// copied close to verbatim) — done deliberately at the user's request,
// not just "same principles, Barkie's own palette" as the first pass.
// One intentional deviation: lapanza3d's dark mode is a manual toggle
// (a button + localStorage + a few lines of JS). This admin center's
// design spec has a standing "no client JavaScript anywhere" constraint
// (server-rendered pages, no build step) — preserved here by making dark
// mode automatic via `prefers-color-scheme` instead of a manual toggle.
export function adminPage(title: string, bodyHtml: string, activeRoute: string = ''): string {
  const navHtml = NAV_GROUPS.map((group) => {
    const itemsHtml = group.items
      .map((item) => `<a class="nav-btn${item.route === activeRoute ? ' active' : ''}" href="${item.href}">${escapeHtml(item.label)}</a>`)
      .join('');
    const labelHtml = group.label ? `<p class="nav-group-label">${escapeHtml(group.label)}</p>` : '';
    return `${labelHtml}${itemsHtml}`;
  }).join('<hr class="nav-divider" />');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)} — Barkie Admin</title>
<meta name="theme-color" content="#f7f3eb" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=Fraunces:opsz,wght@9..144,500..700&display=swap" rel="stylesheet" />
<style>
  :root {
    --bg: #f3eee4;
    --bg-elevated: #faf7f1;
    --bg-soft: #ebe4d7;
    --panel: #fffdf8;
    --ink: #1a1612;
    --muted: #6a5f54;
    --line: rgb(26 22 18 / 0.12);
    --brand: #c24b28;
    --brand-soft: rgb(194 75 40 / 0.12);
    --accent: #d9eb4d;
    --ok: #1f7a45;
    --warn: #a36b12;
    --danger: #b42318;
    --shadow: 0 18px 40px rgb(26 22 18 / 0.08);
    --radius: 14px;
    --font: "DM Sans", system-ui, sans-serif;
    --serif: "Fraunces", Georgia, serif;
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #12100e;
      --bg-elevated: #1a1714;
      --bg-soft: #221e1a;
      --panel: #1e1a16;
      --ink: #f4efe6;
      --muted: #b0a497;
      --line: rgb(244 239 230 / 0.12);
      --brand: #e06a45;
      --brand-soft: rgb(224 106 69 / 0.18);
      --accent: #e4f35a;
      --ok: #4ade80;
      --warn: #fbbf24;
      --danger: #f87171;
      --shadow: 0 18px 40px rgb(0 0 0 / 0.35);
      color-scheme: dark;
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    font-family: var(--font);
    background:
      radial-gradient(900px 500px at 100% 0%, rgb(194 75 40 / 0.12), transparent 55%),
      radial-gradient(700px 400px at 0% 100%, rgb(217 235 77 / 0.08), transparent 50%),
      var(--bg);
    color: var(--ink);
  }

  .shell { display: grid; grid-template-columns: 260px 1fr; min-height: 100vh; }

  .sidebar {
    border-right: 1px solid var(--line);
    background: rgb(250 247 241 / 0.72);
    backdrop-filter: blur(12px);
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    position: sticky;
    top: 0;
    height: 100vh;
  }
  @media (prefers-color-scheme: dark) {
    .sidebar { background: rgb(26 23 20 / 0.85); }
  }

  .sidebar-brand { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
  .brand-mark { font-family: var(--serif); font-size: 1.2rem; font-weight: 650; }
  .brand-mark em { font-style: italic; color: var(--brand); font-weight: 500; }

  .sidebar-nav { display: flex; flex-direction: column; gap: 0.1rem; flex: 1; overflow-y: auto; }
  .nav-btn {
    text-align: left;
    text-decoration: none;
    display: block;
    border: 0;
    background: transparent;
    padding: 0.45rem 0.75rem;
    border-radius: 8px;
    cursor: pointer;
    color: var(--muted);
    font-weight: 600;
    font-size: 0.88rem;
    line-height: 1.3;
  }
  .nav-btn:hover, .nav-btn.active { background: var(--brand-soft); color: var(--brand); }
  nav a[aria-current="page"] { background: var(--brand-soft); color: var(--brand); }
  .nav-group-label {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    opacity: 0.6;
    padding: 0.6rem 0.75rem 0.2rem;
    margin: 0;
  }
  .nav-group-label:first-child { padding-top: 0.1rem; }
  .nav-divider { border: 0; border-top: 1px solid var(--line); margin: 0.5rem 0.4rem; }

  .logout-form { margin: 0; }
  .btn {
    display: inline-block;
    border: 1px solid var(--line);
    background: var(--panel);
    border-radius: 999px;
    padding: 0.65rem 1.05rem;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.9rem;
    font-family: inherit;
    color: var(--ink);
    text-decoration: none;
    text-align: center;
    transition: 0.15s ease;
  }
  .btn:hover { transform: translateY(-1px); }
  .btn-primary { background: var(--ink); color: var(--bg); border-color: var(--ink); }
  @media (prefers-color-scheme: dark) {
    .btn-primary { background: var(--brand); border-color: var(--brand); color: #1a1612; }
  }
  .btn-secondary { background: var(--brand-soft); border-color: transparent; color: var(--brand); }
  .btn-danger { background: rgb(180 35 24 / 0.12); color: var(--danger); border-color: transparent; }
  .btn.small { padding: 0.4rem 0.75rem; font-size: 0.78rem; }
  .btn.full { width: 100%; }

  .main { padding: 1.5rem 1.75rem 3rem; }
  .topbar { display: flex; justify-content: space-between; align-items: end; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
  .topbar h1 { margin: 0; font-family: var(--serif); font-weight: 600; font-size: 2rem; letter-spacing: -0.03em; }
  .eyebrow { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: var(--brand); margin: 0 0 0.4rem; }

  .panel, .stat-card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  .panel { padding: 1.1rem 1.2rem; margin-bottom: 1.25rem; }
  .panel h2 { font-family: var(--serif); font-weight: 600; font-size: 1.2rem; margin: 0 0 0.75rem; }

  .table-wrap { overflow: auto; }
  table.catalog { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
  table.catalog th, table.catalog td { text-align: left; padding: 0.85rem 0.7rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  table.catalog th { font-size: 0.72rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
  table.catalog tbody tr:hover { background: var(--bg-soft); }

  .field { display: flex; flex-direction: column; gap: 0.35rem; }
  .field span, .field-label { font-size: 0.78rem; font-weight: 650; color: var(--muted); }
  .field textarea { min-height: 120px; resize: vertical; }
  .field.checkbox { flex-direction: row; align-items: center; gap: 0.55rem; }
  .field.checkbox input { width: auto; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; }
  .stack { display: flex; flex-direction: column; }
  .gap-2 { gap: 0.5rem; }
  .gap-3 { gap: 0.75rem; }

  input, select, textarea {
    width: 100%;
    font-family: inherit;
    font-size: 0.9rem;
    border: 1px solid var(--line);
    background: var(--bg-elevated);
    color: var(--ink);
    border-radius: 10px;
    padding: 0.7rem 0.85rem;
  }

  .rand-input { position: relative; display: inline-block; width: 100%; }
  .rand-input::before {
    content: 'R';
    position: absolute;
    left: 0.5rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--muted);
    font-size: 0.85rem;
    pointer-events: none;
  }
  .rand-input input { padding-left: 1.35rem; }

  .badge {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 0.18rem 0.55rem;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .badge.published { background: rgb(31 122 69 / 0.14); color: var(--ok); }
  .badge.draft { background: rgb(163 107 18 / 0.16); color: var(--warn); }
  .badge.priority-critical { background: rgb(178 34 34 / 0.16); color: #a51d1d; }
  .badge.priority-high { background: rgb(204 91 33 / 0.16); color: #a34a16; }
  .badge.priority-medium { background: rgb(163 107 18 / 0.16); color: var(--warn); }
  .badge.priority-low { background: rgb(31 122 69 / 0.14); color: var(--ok); }

  .error { color: var(--danger); font-weight: 600; }

  @media (max-width: 980px) {
    .shell { grid-template-columns: 1fr; }
    .sidebar { position: relative; height: auto; border-right: 0; border-bottom: 1px solid var(--line); }
    .sidebar-nav { flex-direction: row; flex-wrap: wrap; }
    .grid-2, .grid-3 { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<div class="shell">
  <aside class="sidebar">
    <div class="sidebar-brand">
      <span class="brand-mark">Barkie <em>Admin</em></span>
    </div>
    <nav class="sidebar-nav">
      ${navHtml}
      <hr class="nav-divider" />
      <p class="nav-group-label">External</p>
      <a class="nav-btn" href="https://barkie.co.za/admin/signups" target="_blank" rel="noopener">Launch signups &#8599;</a>
    </nav>
    <form class="logout-form" method="post" action="/api/admin/logout"><button type="submit" class="btn full">Log out</button></form>
  </aside>
  <main class="main">
    <header class="topbar">
      <div>
        <p class="eyebrow">Barkie Admin</p>
        <h1>${escapeHtml(title)}</h1>
      </div>
    </header>
    ${bodyHtml}
  </main>
</div>
</body>
</html>`;
}
