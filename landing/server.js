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

const port = process.env.PORT ? Number(process.env.PORT) : 4100;
app.listen(port, () => {
  console.log(`Barkie landing page listening on http://localhost:${port}`);
});
