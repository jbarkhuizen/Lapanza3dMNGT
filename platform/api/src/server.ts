import { buildApp } from './app.js';
import { env } from './env.js';
import { startNotificationScheduler } from './notifications/scheduler.js';
import { startSlicerWorker } from './slicer/worker.js';

const app = buildApp();
app.listen(env.port, () => {
  console.log(`Barkie API listening on http://localhost:${env.port}`);
  startNotificationScheduler();
  startSlicerWorker();
});
