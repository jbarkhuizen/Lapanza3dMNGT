import express from 'express';
import rateLimit from 'express-rate-limit';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'signups.db'));

db.prepare(
  `CREATE TABLE IF NOT EXISTS signups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    ip_hash TEXT,
    created_at TEXT NOT NULL
  )`
).run();

const insertSignup = db.prepare(
  'INSERT OR IGNORE INTO signups (email, ip_hash, created_at) VALUES (?, ?, ?)'
);

const app = express();
app.use(express.json());
// Registered before express.static below: express.static only serves files
// that actually exist on disk, and there is no shop.html at a slug-shaped
// path (/shop/acme-prints), so the dynamic route must be handled first.
app.get('/shop/:slug', (req, res) => res.sendFile(path.join(__dirname, 'public', 'shop.html')));
app.use(express.static(path.join(__dirname, 'public')));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const notifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/api/notify', notifyLimiter, (req, res) => {
  const { email, consent, company } = req.body ?? {};

  if (typeof company === 'string' && company.trim() !== '') {
    // Honeypot field — bots fill it, humans never see it. Pretend success.
    return res.json({ ok: true });
  }

  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ ok: false, error: 'Enter a valid email address.' });
  }

  if (consent !== true) {
    return res.status(400).json({ ok: false, error: 'Please tick the consent checkbox.' });
  }

  const ip = req.ip ?? '';
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex');

  try {
    insertSignup.run(email.trim().toLowerCase(), ipHash, new Date().toISOString());
    return res.json({ ok: true });
  } catch (err) {
    console.error('signup insert failed', err);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Try again shortly.' });
  }
});

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireAdminAuth(req, res, next) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(503).send('Admin view is not configured on this deployment.');
  }

  const header = req.headers.authorization ?? '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    const password = separatorIndex === -1 ? '' : decoded.slice(separatorIndex + 1);
    if (timingSafeEqual(password, adminPassword)) {
      return next();
    }
  }

  res.set('WWW-Authenticate', 'Basic realm="Barkie admin"');
  return res.status(401).send('Authentication required.');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

app.get('/admin/signups', requireAdminAuth, (req, res) => {
  const rows = db.prepare('SELECT id, email, created_at FROM signups ORDER BY created_at DESC').all();
  const tableRows = rows.map((r) => (
    `<tr><td>${r.id}</td><td>${escapeHtml(r.email)}</td><td>${escapeHtml(r.created_at)}</td></tr>`
  )).join('');
  res.set('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Barkie — launch signups</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; background: #f7f3eb; color: #1a1612; margin: 0; padding: 32px; }
  h1 { font-size: 20px; }
  p.count { color: #3b322b; }
  table { border-collapse: collapse; width: 100%; max-width: 720px; margin-top: 16px; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e0d8c8; font-size: 14px; }
  th { text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; color: #3b322b; }
</style>
</head>
<body>
  <h1>Barkie launch signups</h1>
  <p class="count">${rows.length} signup${rows.length === 1 ? '' : 's'}</p>
  <table>
    <thead><tr><th>#</th><th>Email</th><th>Added (UTC)</th></tr></thead>
    <tbody>${tableRows || '<tr><td colspan="3">No signups yet.</td></tr>'}</tbody>
  </table>
</body>
</html>`);
});

const port = process.env.PORT ? Number(process.env.PORT) : 4100;
app.listen(port, () => {
  console.log(`Barkie landing page listening on http://localhost:${port}`);
});
