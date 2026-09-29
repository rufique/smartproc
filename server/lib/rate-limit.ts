import { TRPCError } from '@trpc/server';

import { middleware } from '../trpc/init';

type Bucket = { count: number; resetAt: number };

/**
 * Process-local sliding-window rate limiter.
 *
 * Good enough to blunt credential-stuffing / reset-token brute force on a single
 * instance. For a multi-instance deployment, back this with Redis instead.
 */
export function createRateLimiter({
  key,
  limit,
  windowMs,
}: {
  key: string;
  limit: number;
  windowMs: number;
}) {
  const buckets = new Map<string, Bucket>();

  const prune = (now: number) => {
    if (buckets.size < 5_000) return;
    for (const [id, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(id);
  };

  return middleware(async ({ ctx, next }) => {
    const now = Date.now();
    prune(now);
    const id = `${key}:${ctx.ip}`;
    const bucket = buckets.get(id);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(id, { count: 1, resetAt: now + windowMs });
    } else {
      bucket.count += 1;
      if (bucket.count > limit) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many attempts. Please wait a moment and try again.',
        });
      }
    }
    return next();
  });
}
