import { runNotificationChecks } from './checks.js';

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Must be called only from src/server.ts, after app.listen(...) — never from
// buildApp() or any test. buildApp() is invoked directly by nearly every
// test file in tests/, and a live setInterval started on every test's app
// instance would leak timers across the whole suite.
export function startNotificationScheduler(): void {
  runNotificationChecks().catch((err) => console.error('notification check failed', err));
  setInterval(() => {
    runNotificationChecks().catch((err) => console.error('notification check failed', err));
  }, CHECK_INTERVAL_MS);
}
