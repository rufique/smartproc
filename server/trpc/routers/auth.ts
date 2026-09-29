import { TRPCError } from '@trpc/server';
import { compareSync, hashSync } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { desc, eq, sql } from 'drizzle-orm';
import { sign } from 'hono/jwt';
import { z } from 'zod';

import { env } from '../../env';
import { users, workspaces } from '../../db/schema';
import { createRateLimiter } from '../../lib/rate-limit';
import { protectedProcedure, publicProcedure, router } from '../init';

const DEFAULT_INDUSTRY = 'Other';
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

const loginLimiter = createRateLimiter({ key: 'login', limit: 10, windowMs: 60_000 });
const registerLimiter = createRateLimiter({ key: 'register', limit: 5, windowMs: 60_000 });
const forgotLimiter = createRateLimiter({ key: 'forgot', limit: 5, windowMs: 15 * 60_000 });
const resetLimiter = createRateLimiter({ key: 'reset', limit: 10, windowMs: 15 * 60_000 });

async function issueToken(userId: string, tokenVersion: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: userId, ver: tokenVersion, iat: now, exp: now + TOKEN_TTL_SECONDS },
    env.jwtSecret
  );
}

function publicUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}

export const authRouter = router({
  register: publicProcedure
    .use(registerLimiter)
    .input(
      z.object({
        name: z.string().min(1).max(120),
        email: z.string().email().max(200),
        password: z.string().min(6).max(200),
        companyName: z.string().min(1).max(160).optional(),
        industry: z.string().min(1).max(120).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase().trim();
      const [existing] = await ctx.db.select().from(users).where(eq(users.email, email)).limit(1);
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'An account with this email already exists',
        });
      }
      const [user] = await ctx.db
        .insert(users)
        .values({
          name: input.name.trim(),
          email,
          passwordHash: hashSync(input.password, 10),
        })
        .returning();
      if (!user)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not create account' });

      const [workspace] = await ctx.db
        .insert(workspaces)
        .values({
          userId: user.id,
          name: input.companyName?.trim() || 'My Company',
          industry: input.industry?.trim() || DEFAULT_INDUSTRY,
        })
        .returning();

      const token = await issueToken(user.id, user.tokenVersion);
      const ws = await ctx.db
        .select()
        .from(workspaces)
        .where(eq(workspaces.userId, user.id))
        .orderBy(desc(workspaces.createdAt));
      return {
        token,
        user: publicUser(user),
        workspaces: ws,
        activeWorkspaceId: workspace?.id ?? null,
      };
    }),

  login: publicProcedure
    .use(loginLimiter)
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase().trim();
      const [user] = await ctx.db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user || !compareSync(input.password, user.passwordHash)) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect email or password' });
      }
      const token = await issueToken(user.id, user.tokenVersion);
      const ws = await ctx.db
        .select()
        .from(workspaces)
        .where(eq(workspaces.userId, user.id))
        .orderBy(desc(workspaces.createdAt));
      return {
        token,
        user: publicUser(user),
        workspaces: ws,
        // Most recently created workspace; the client keeps its own last-used
        // selection when it is still present (see store.setSession).
        activeWorkspaceId: ws[0]?.id ?? null,
      };
    }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const ws = await ctx.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, ctx.user.id))
      .orderBy(desc(workspaces.createdAt));
    return { user: publicUser(ctx.user), workspaces: ws };
  }),

  updateProfile: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(users)
        .set({ name: input.name.trim() })
        .where(eq(users.id, ctx.user.id))
        .returning();
      if (!updated)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not update profile' });
      return publicUser(updated);
    }),

  /** Invalidate every outstanding token for this account. */
  logout: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(users)
      .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, ctx.user.id));
    return { ok: true as const };
  }),

  // v1 has no email service: outside production the reset token is returned to the caller.
  forgotPassword: publicProcedure
    .use(forgotLimiter)
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase().trim();
      const [user] = await ctx.db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user) return { ok: true as const, devToken: null as string | null };

      if (env.isProduction) {
        // No email provider is wired up in v1, so we cannot deliver the token here.
        // Never expose it to the caller in production.
        console.info(`[auth] Password reset requested for ${email} (no email delivery configured)`);
        return { ok: true as const, devToken: null as string | null };
      }

      const devToken = randomBytes(16).toString('hex');
      await ctx.db
        .update(users)
        .set({ resetToken: devToken, resetTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000) })
        .where(eq(users.id, user.id));
      console.info(`[auth] Password reset token for ${email}: ${devToken}`);
      return { ok: true as const, devToken };
    }),

  resetPassword: publicProcedure
    .use(resetLimiter)
    .input(z.object({ token: z.string().min(4), password: z.string().min(6).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db
        .select()
        .from(users)
        .where(eq(users.resetToken, input.token))
        .limit(1);
      if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt.getTime() < Date.now()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Reset token is invalid or expired' });
      }
      await ctx.db
        .update(users)
        .set({
          passwordHash: hashSync(input.password, 10),
          resetToken: null,
          resetTokenExpiresAt: null,
          // Sign out every existing session after a password reset.
          tokenVersion: sql`${users.tokenVersion} + 1`,
        })
        .where(eq(users.id, user.id));
      return { ok: true as const };
    }),
});
