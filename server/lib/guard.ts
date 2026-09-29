import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';

import type { Db } from '../db';
import { workspaces } from '../db/schema';

/** Ensures the workspace exists and belongs to the calling user (strict per-workspace isolation). */
export async function requireWorkspace(db: Db, workspaceId: string, userId: string) {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!ws || ws.userId !== userId) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' });
  }
  return ws;
}

/** numeric() columns come back from Postgres as strings — normalize to numbers. */
export function num(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
