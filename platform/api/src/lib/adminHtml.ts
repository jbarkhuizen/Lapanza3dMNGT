export function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

// Soft-tint pill badges (14-22% opacity background, full-strength text) —
// the status/priority convention this admin center's styling deliberately
// mirrors from the lapanza3d admin panel's own badge pattern, adapted to
// Barkie's own brand palette rather than copying lapanza3d's literal colors.
const BADGE_COLORS: Record<string, string> = {
  Done: '#1f7a45',
  Backlog: '#6a5f54',
  Critical: '#b42318',
  High: '#c24b28',
  Medium: '#a36b12',
  Low: '#6a5f54',
};

export function badge(label: string): string {
  const color = Object.hasOwn(BADGE_COLORS, label) ? BADGE_COLORS[label] : '#6a5f54';
  return `<span class="badge" style="background:${color}22;color:${color}">${escapeHtml(label)}</span>`;
}

// Every admin page except the login screen shares this wrapper — one
// place for the nav bar, the shared stylesheet, and the escaped title.
// bodyHtml is the caller's own already-escaped-per-value HTML fragment,
// never a raw user-controlled string on its own.
export function adminPage(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)} — Barkie Admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
<style>
  body { font-family: "DM Sans", ui-sans-serif, system-ui, sans-serif; background: #f7f3eb; color: #1a1612; margin: 0; padding: 32px; }
  h1 { font-family: "Fraunces", ui-serif, Georgia, serif; font-weight: 600; font-size: 26px; margin: 0 0 20px; letter-spacing: -0.01em; }
  h2 { font-family: "Fraunces", ui-serif, Georgia, serif; font-weight: 600; font-size: 18px; margin: 0 0 12px; }
  nav { border-bottom: 2px solid #1a1612; padding-bottom: 16px; margin-bottom: 24px; }
  nav a { margin-right: 16px; color: #c24b28; text-decoration: none; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; }
  nav a[aria-current="page"] { color: #1a1612; }
  table { border-collapse: collapse; width: 100%; margin-top: 16px; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e0d8c8; font-size: 14px; }
  th { text-transform: uppercase; font-size: 11px; letter-spacing: 0.08em; color: #6a5f54; font-weight: 700; }
  tr:hover td { background: #efe7d822; }
  form.inline { display: inline-flex; gap: 8px; align-items: center; }
  input, select, textarea { font-family: inherit; font-size: 14px; padding: 6px 8px; border: 1px solid #cbbfa8; border-radius: 4px; }
  textarea { width: 100%; box-sizing: border-box; }
  button { font-family: inherit; font-size: 14px; padding: 6px 14px; border: none; border-radius: 4px; background: #c24b28; color: #fff; cursor: pointer; }
  .card { background: #efe7d8; border: 1px solid #e0d8c8; border-radius: 8px; padding: 20px; margin-bottom: 20px; max-width: 640px; }
  .error { color: #c24b28; font-weight: 600; }
  .logout-form { float: right; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
</style>
</head>
<body>
<nav>
  <a href="/api/admin">Dashboard</a>
  <a href="/api/admin/tenants">Tenants</a>
  <a href="/api/admin/plans">Plans</a>
  <a href="/api/admin/backlog">Backlog</a>
  <a href="https://barkie.co.za/admin/signups" target="_blank" rel="noopener">Launch signups &#8599;</a>
  <form class="logout-form" method="post" action="/api/admin/logout"><button type="submit">Log out</button></form>
</nav>
<h1>${escapeHtml(title)}</h1>
${bodyHtml}
</body>
</html>`;
}
