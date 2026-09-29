import { TRPCError } from '@trpc/server';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { workspaces } from '../../db/schema';
import { protectedProcedure, publicProcedure, router } from '../init';
import { requireWorkspace } from '../../lib/guard';

export const INDUSTRIES = [
  'Healthcare & Pharmaceuticals',
  'Building & Hardware',
  'Food & Grocery Retail',
  'Electronics & Appliances',
  'Agriculture & Agrochemicals',
  'Fashion & Apparel',
  'Industrial & Manufacturing',
  'Hospitality Supplies',
  'Other',
] as const;

export const workspaceRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, ctx.user.id))
      .orderBy(desc(workspaces.createdAt));
  }),

  industries: publicProcedure.query(() => INDUSTRIES),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(160),
        industry: z.string().min(1).max(120),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [workspace] = await ctx.db
        .insert(workspaces)
        .values({ userId: ctx.user.id, name: input.name.trim(), industry: input.industry })
        .returning();
      return workspace;
    }),

  remove: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      const owned = await ctx.db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.userId, ctx.user.id));
      if (owned.length <= 1) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You need at least one workspace.',
        });
      }
      await ctx.db.delete(workspaces).where(eq(workspaces.id, input.workspaceId));
      return { ok: true as const };
    }),
});
