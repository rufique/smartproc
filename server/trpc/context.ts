import { eq } from 'drizzle-orm';
import { verify } from 'hono/jwt';

import { db } from '../db';
import { users } from '../db/schema';
import { env } from '../env';

export type Context = {
  db: typeof db;
  user: typeof users.$inferSelect | null;
  /** Best-effort client IP, used for rate limiting. */
  ip: string;
};

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim() || 'unknown';
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

export async function createContext(req: Request): Promise<Context> {
  const ip = clientIp(req);
  const header = req.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) return { db, user: null, ip };
  try {
    const payload = await verify(token, env.jwtSecret, 'HS256');
    const userId = String(payload.sub ?? '');
    if (!userId) return { db, user: null, ip };
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    // A token is only valid while it matches the user's current token version.
    const tokenVersion = Number(payload.ver ?? 0);
    if (!user || user.tokenVersion !== tokenVersion) return { db, user: null, ip };
    return { db, user, ip };
  } catch {
    return { db, user: null, ip };
  }
}
