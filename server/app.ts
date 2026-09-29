import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { env } from './env';
import { createContext } from './trpc/context';
import { appRouter } from './trpc/router';

const app = new Hono();

const allowedOrigins =
  env.corsOrigin === '*' ? '*' : env.corsOrigin.split(',').map((origin) => origin.trim());

app.use(
  '*',
  cors({
    origin: allowedOrigins,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  })
);

app.get('/health', (c) => c.json({ ok: true, name: 'smartproc-api' }));

app.all('/api/trpc/*', (c) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req: c.req.raw,
    router: appRouter,
    createContext: ({ req }) => createContext(req),
    onError({ error, path }) {
      console.error(`[trpc] ${path ?? 'unknown'}:`, error.message);
    },
  })
);

export default app;
