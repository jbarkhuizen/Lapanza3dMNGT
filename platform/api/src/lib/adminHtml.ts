export function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
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
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; background: #f7f3eb; color: #1a1612; margin: 0; padding: 32px; }
  h1 { font-size: 22px; margin: 0 0 20px; }
  h2 { font-size: 16px; margin: 0 0 12px; }
  nav { border-bottom: 2px solid #1a1612; padding-bottom: 16px; margin-bottom: 24px; }
  nav a { margin-right: 16px; color: #c24b28; text-decoration: none; font-weight: 600; }
  table { border-collapse: collapse; width: 100%; margin-top: 16px; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e0d8c8; font-size: 14px; }
  th { text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; color: #3b322b; }
  form.inline { display: inline-flex; gap: 8px; align-items: center; }
  input, select { font-family: inherit; font-size: 14px; padding: 6px 8px; border: 1px solid #cbbfa8; border-radius: 4px; }
  button { font-family: inherit; font-size: 14px; padding: 6px 14px; border: none; border-radius: 4px; background: #c24b28; color: #fff; cursor: pointer; }
  .card { background: #efe7d8; border: 1px solid #e0d8c8; border-radius: 8px; padding: 20px; margin-bottom: 20px; max-width: 640px; }
  .error { color: #c24b28; font-weight: 600; }
  .logout-form { float: right; }
</style>
</head>
<body>
<nav>
  <a href="/api/admin">Dashboard</a>
  <a href="/api/admin/tenants">Tenants</a>
  <a href="/api/admin/plans">Plans</a>
  <a href="https://barkie.co.za/admin/signups" target="_blank" rel="noopener">Launch signups &#8599;</a>
  <form class="logout-form" method="post" action="/api/admin/logout"><button type="submit">Log out</button></form>
</nav>
<h1>${escapeHtml(title)}</h1>
${bodyHtml}
</body>
</html>`;
}
