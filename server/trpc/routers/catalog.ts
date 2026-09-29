import { TRPCError } from '@trpc/server';
import { and, desc, eq, ilike, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { priceHistory, productGroups, productPrices, products, vendors } from '../../db/schema';
import { num, requireWorkspace } from '../../lib/guard';
import { nameSimilarity } from '../../lib/fuzzy';
import { protectedProcedure, router } from '../init';

type Offer = { vendorId: string; vendorName: string; price: number };

async function offersFor(
  ctx: { db: import('../../db').Db },
  productIds: string[]
): Promise<Map<string, Offer[]>> {
  const map = new Map<string, Offer[]>();
  if (!productIds.length) return map;
  const rows = await ctx.db
    .select({
      productId: productPrices.productId,
      vendorId: productPrices.vendorId,
      vendorName: vendors.name,
      price: productPrices.price,
    })
    .from(productPrices)
    .innerJoin(vendors, eq(productPrices.vendorId, vendors.id))
    .where(inArray(productPrices.productId, productIds));
  for (const row of rows) {
    const list = map.get(row.productId) ?? [];
    list.push({ vendorId: row.vendorId, vendorName: row.vendorName, price: num(row.price) });
    map.set(row.productId, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.price - b.price);
  return map;
}

export const catalogRouter = router({
  // ---------- vendors ----------
  vendors: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      return ctx.db
        .select()
        .from(vendors)
        .where(eq(vendors.workspaceId, input.workspaceId))
        .orderBy(vendors.name);
    }),

  createVendor: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(1).max(120),
        contact: z.string().max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      const [vendor] = await ctx.db
        .insert(vendors)
        .values({
          workspaceId: input.workspaceId,
          name: input.name.trim(),
          contact: input.contact ?? null,
        })
        .returning();
      return vendor;
    }),

  removeVendor: protectedProcedure
    .input(z.object({ workspaceId: z.string(), vendorId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      await ctx.db
        .delete(vendors)
        .where(and(eq(vendors.id, input.vendorId), eq(vendors.workspaceId, input.workspaceId)));
      return { ok: true as const };
    }),

  // ---------- products ----------
  listProducts: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        search: z.string().max(160).optional(),
        filter: z.enum(['all', 'grouped', 'ungrouped', 'low']).optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).max(100_000).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      const limit = input.limit ?? 100;
      const offset = input.offset ?? 0;
      const search = input.search?.trim();

      // Search + filters run in Postgres so we never load a whole catalog into memory.
      const conditions = [eq(products.workspaceId, input.workspaceId)];
      if (search) {
        const pattern = `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
        const searchClause = or(ilike(products.name, pattern), ilike(products.category, pattern));
        if (searchClause) conditions.push(searchClause);
      }
      if (input.filter === 'grouped') conditions.push(isNotNull(products.groupId));
      if (input.filter === 'ungrouped') conditions.push(isNull(products.groupId));
      if (input.filter === 'low') {
        conditions.push(
          sql`${products.stockQty} is not null and ${products.lowStockThreshold} is not null and ${products.stockQty} <= ${products.lowStockThreshold}`
        );
      }
      const where = and(...conditions);

      const [countRow] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(products)
        .where(where);
      const total = countRow?.count ?? 0;

      const page = await ctx.db
        .select()
        .from(products)
        .where(where)
        .orderBy(products.name)
        .limit(limit)
        .offset(offset);

      const groupIds = [...new Set(page.map((p) => p.groupId).filter((id): id is string => !!id))];
      const groups = groupIds.length
        ? await ctx.db.select().from(productGroups).where(inArray(productGroups.id, groupIds))
        : [];
      const groupById = new Map(groups.map((g) => [g.id, g]));
      // Member counts are workspace-wide (not just this page) so the badge is accurate.
      const memberRows = groupIds.length
        ? await ctx.db
            .select({ groupId: products.groupId, count: sql<number>`count(*)::int` })
            .from(products)
            .where(
              and(eq(products.workspaceId, input.workspaceId), inArray(products.groupId, groupIds))
            )
            .groupBy(products.groupId)
        : [];
      const memberCount = new Map(memberRows.map((r) => [r.groupId, r.count]));

      const offers = await offersFor(
        ctx,
        page.map((p) => p.id)
      );

      const items = page.map((p) => {
        const productOffers = offers.get(p.id) ?? [];
        const group = p.groupId ? groupById.get(p.groupId) : undefined;
        const linkedCount = p.groupId ? Math.max((memberCount.get(p.groupId) ?? 1) - 1, 0) : 0;
        const stockQty = p.stockQty === null ? null : num(p.stockQty);
        const threshold = p.lowStockThreshold === null ? null : num(p.lowStockThreshold);
        const isLow = stockQty !== null && threshold !== null && stockQty <= threshold;
        return {
          id: p.id,
          name: p.name,
          unit: p.unit,
          category: p.category,
          stockQty,
          lowStockThreshold: threshold,
          updatedAt: p.updatedAt.toISOString(),
          groupId: p.groupId,
          groupLabel: group?.label ?? null,
          linkedCount,
          isLowStock: isLow,
          offers: productOffers,
          lowestPrice: productOffers[0]?.price ?? null,
        };
      });

      return { items, total, hasMore: offset + page.length < total };
    }),

  getProduct: protectedProcedure
    .input(z.object({ workspaceId: z.string(), productId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      const [product] = await ctx.db
        .select()
        .from(products)
        .where(and(eq(products.id, input.productId), eq(products.workspaceId, input.workspaceId)))
        .limit(1);
      if (!product) throw new TRPCError({ code: 'NOT_FOUND', message: 'Product not found' });

      const offers = (await offersFor(ctx, [product.id])).get(product.id) ?? [];
      const groupMembers = product.groupId
        ? await ctx.db
            .select()
            .from(products)
            .where(and(eq(products.groupId, product.groupId), ne(products.id, product.id)))
        : [];
      const group = product.groupId
        ? (
            await ctx.db
              .select()
              .from(productGroups)
              .where(eq(productGroups.id, product.groupId))
              .limit(1)
          )[0]
        : undefined;

      const history = await ctx.db
        .select({
          id: priceHistory.id,
          price: priceHistory.price,
          previousPrice: priceHistory.previousPrice,
          recordedAt: priceHistory.recordedAt,
          vendorId: priceHistory.vendorId,
          vendorName: vendors.name,
        })
        .from(priceHistory)
        .innerJoin(vendors, eq(priceHistory.vendorId, vendors.id))
        .where(and(eq(priceHistory.productId, product.id)))
        .orderBy(desc(priceHistory.recordedAt))
        .limit(30);

      return {
        id: product.id,
        name: product.name,
        unit: product.unit,
        category: product.category,
        stockQty: product.stockQty === null ? null : num(product.stockQty),
        lowStockThreshold:
          product.lowStockThreshold === null ? null : num(product.lowStockThreshold),
        updatedAt: product.updatedAt.toISOString(),
        groupId: product.groupId,
        group: group ? { id: group.id, label: group.label } : null,
        groupMembers: groupMembers.map((m) => ({ id: m.id, name: m.name })),
        offers,
        history: history.map((h) => ({
          id: h.id,
          price: num(h.price),
          previousPrice: h.previousPrice === null ? null : num(h.previousPrice),
          recordedAt: h.recordedAt.toISOString(),
          vendorId: h.vendorId,
          vendorName: h.vendorName,
        })),
      };
    }),

  createProduct: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(1).max(160),
        unit: z.string().max(40).optional(),
        category: z.string().max(80).optional(),
        stockQty: z.number().nullable().optional(),
        lowStockThreshold: z.number().nullable().optional(),
        vendorId: z.string().optional(),
        vendorName: z.string().max(120).optional(),
        price: z.number().nonnegative().nullable().optional(),
        groupId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);

      const [product] = await ctx.db
        .insert(products)
        .values({
          workspaceId: input.workspaceId,
          name: input.name.trim(),
          unit: input.unit?.trim() || 'unit',
          category: input.category?.trim() || '',
          stockQty:
            input.stockQty === null || input.stockQty === undefined ? null : String(input.stockQty),
          lowStockThreshold:
            input.lowStockThreshold === null || input.lowStockThreshold === undefined
              ? null
              : String(input.lowStockThreshold),
          groupId: input.groupId ?? null,
        })
        .returning();
      if (!product)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not create product' });

      await attachOffer(ctx, input, product.id);
      return product;
    }),

  updateProduct: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        productId: z.string(),
        name: z.string().min(1).max(160).optional(),
        unit: z.string().max(40).optional(),
        category: z.string().max(80).optional(),
        stockQty: z.number().nullable().optional(),
        lowStockThreshold: z.number().nullable().optional(),
        groupId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      const patch: Partial<typeof products.$inferInsert> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name.trim();
      if (input.unit !== undefined) patch.unit = input.unit.trim() || 'unit';
      if (input.category !== undefined) patch.category = input.category.trim();
      if (input.stockQty !== undefined)
        patch.stockQty = input.stockQty === null ? null : String(input.stockQty);
      if (input.lowStockThreshold !== undefined)
        patch.lowStockThreshold =
          input.lowStockThreshold === null ? null : String(input.lowStockThreshold);
      if (input.groupId !== undefined) patch.groupId = input.groupId;

      const [updated] = await ctx.db
        .update(products)
        .set(patch)
        .where(and(eq(products.id, input.productId), eq(products.workspaceId, input.workspaceId)))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Product not found' });
      return updated;
    }),

  removeProduct: protectedProcedure
    .input(z.object({ workspaceId: z.string(), productId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      await ctx.db
        .delete(products)
        .where(and(eq(products.id, input.productId), eq(products.workspaceId, input.workspaceId)));
      return { ok: true as const };
    }),

  /** Create or update the price of a product at a vendor (also records price history on change). */
  setPrice: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        productId: z.string(),
        vendorId: z.string().optional(),
        vendorName: z.string().max(120).optional(),
        price: z.number().nonnegative(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);

      const [ownedProduct] = await ctx.db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.id, input.productId), eq(products.workspaceId, input.workspaceId)))
        .limit(1);
      if (!ownedProduct) throw new TRPCError({ code: 'NOT_FOUND', message: 'Product not found' });

      let vendorId = input.vendorId;
      if (vendorId) {
        const [ownedVendor] = await ctx.db
          .select({ id: vendors.id })
          .from(vendors)
          .where(and(eq(vendors.id, vendorId), eq(vendors.workspaceId, input.workspaceId)))
          .limit(1);
        if (!ownedVendor) throw new TRPCError({ code: 'NOT_FOUND', message: 'Vendor not found' });
      }
      if (!vendorId && input.vendorName) {
        const allVendors = await ctx.db
          .select()
          .from(vendors)
          .where(eq(vendors.workspaceId, input.workspaceId));
        const match = allVendors.find((v) => nameSimilarity(v.name, input.vendorName!) > 0.8);
        if (match) vendorId = match.id;
        else {
          const [created] = await ctx.db
            .insert(vendors)
            .values({ workspaceId: input.workspaceId, name: input.vendorName.trim() })
            .returning();
          vendorId = created!.id;
        }
      }
      if (!vendorId)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'vendorId or vendorName is required' });
      await applyPrice(ctx, input.workspaceId, input.productId, vendorId, input.price, null);
      return { ok: true as const };
    }),

  removeOffer: protectedProcedure
    .input(z.object({ workspaceId: z.string(), productId: z.string(), vendorId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      await ctx.db
        .delete(productPrices)
        .where(
          and(
            eq(productPrices.workspaceId, input.workspaceId),
            eq(productPrices.productId, input.productId),
            eq(productPrices.vendorId, input.vendorId)
          )
        );
      return { ok: true as const };
    }),

  // ---------- groups (substitutes) ----------
  groups: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      const list = await ctx.db
        .select()
        .from(productGroups)
        .where(eq(productGroups.workspaceId, input.workspaceId));
      const counts = await ctx.db
        .select({ groupId: products.groupId, c: sql<number>`count(*)::int` })
        .from(products)
        .where(and(eq(products.workspaceId, input.workspaceId), isNotNull(products.groupId)))
        .groupBy(products.groupId);
      const countMap = new Map(counts.map((c) => [c.groupId, c.c]));
      return list.map((g) => ({ ...g, memberCount: countMap.get(g.id) ?? 0 }));
    }),

  saveGroup: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        groupId: z.string().optional(),
        label: z.string().min(1).max(120),
        productIds: z.array(z.string()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      let groupId = input.groupId;
      if (groupId) {
        await ctx.db
          .update(productGroups)
          .set({ label: input.label.trim() })
          .where(
            and(eq(productGroups.id, groupId), eq(productGroups.workspaceId, input.workspaceId))
          );
      } else {
        const [group] = await ctx.db
          .insert(productGroups)
          .values({ workspaceId: input.workspaceId, label: input.label.trim() })
          .returning();
        groupId = group!.id;
      }
      // detach any of these products from other groups, then attach
      await ctx.db
        .update(products)
        .set({ groupId, updatedAt: new Date() })
        .where(
          and(eq(products.workspaceId, input.workspaceId), inArray(products.id, input.productIds))
        );
      return { groupId };
    }),

  removeGroup: protectedProcedure
    .input(z.object({ workspaceId: z.string(), groupId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      await ctx.db
        .update(products)
        .set({ groupId: null, updatedAt: new Date() })
        .where(
          and(eq(products.workspaceId, input.workspaceId), eq(products.groupId, input.groupId))
        );
      await ctx.db
        .delete(productGroups)
        .where(
          and(eq(productGroups.id, input.groupId), eq(productGroups.workspaceId, input.workspaceId))
        );
      return { ok: true as const };
    }),
});

async function attachOffer(
  ctx: { db: import('../../db').Db },
  input: { workspaceId: string; vendorId?: string; vendorName?: string; price?: number | null },
  productId: string
) {
  if (input.price === undefined || input.price === null) return;
  let vendorId = input.vendorId;
  if (!vendorId && input.vendorName) {
    const allVendors = await ctx.db
      .select()
      .from(vendors)
      .where(eq(vendors.workspaceId, input.workspaceId));
    const match = allVendors.find((v) => nameSimilarity(v.name, input.vendorName!) > 0.8);
    if (match) vendorId = match.id;
    else {
      const [created] = await ctx.db
        .insert(vendors)
        .values({ workspaceId: input.workspaceId, name: input.vendorName.trim() })
        .returning();
      vendorId = created!.id;
    }
  }
  if (!vendorId) return;
  await applyPrice(ctx, input.workspaceId, productId, vendorId, input.price, null);
}

/** Upsert a product-vendor price and record history when it changes. */
export async function applyPrice(
  ctx: { db: import('../../db').Db },
  workspaceId: string,
  productId: string,
  vendorId: string,
  price: number,
  sourceUploadId: string | null
) {
  const rounded = Math.round(price * 100) / 100;
  const [existing] = await ctx.db
    .select()
    .from(productPrices)
    .where(and(eq(productPrices.productId, productId), eq(productPrices.vendorId, vendorId)))
    .limit(1);

  if (existing && Math.abs(num(existing.price) - rounded) < 0.005) return { changed: false };

  await ctx.db
    .insert(productPrices)
    .values({
      workspaceId,
      productId,
      vendorId,
      price: rounded.toFixed(2),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [productPrices.productId, productPrices.vendorId],
      set: { price: rounded.toFixed(2), updatedAt: new Date() },
    });

  await ctx.db.insert(priceHistory).values({
    workspaceId,
    productId,
    vendorId,
    price: rounded.toFixed(2),
    previousPrice: existing ? num(existing.price).toFixed(2) : null,
    sourceUploadId,
    recordedAt: new Date(),
  });

  await ctx.db.update(products).set({ updatedAt: new Date() }).where(eq(products.id, productId));
  return { changed: true };
}
