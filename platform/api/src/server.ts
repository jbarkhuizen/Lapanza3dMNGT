import { buildApp } from './app.js';
import { env } from './env.js';

const app = buildApp();
app.listen(env.port, () => {
  console.log(`Barkie API listening on http://localhost:${env.port}`);
});
