import { serve } from '@hono/node-server';

import app from './app';
import { db } from './db';
import { env } from './env';
import { ensureTrigramExtension } from './lib/match';

// Idempotent: enables pg_trgm + the product-name GIN index on boot.
void ensureTrigramExtension(db);

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`SmartProc API listening on http://localhost:${info.port}`);
});
