import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  products,
  productGroups,
  productPrices,
  purchaseEvents,
  purchaseOrderLines,
  purchaseOrders,
  vendors,
} from '../../db/schema';
import { num, requireWorkspace } from '../../lib/guard';
import { protectedProcedure, router } from '../init';

type Offer = {
  vendorId: string;
  vendorName: string;
  productId: string;
  productName: string;
  price: number;
};

type CompareLine = {
  lineId: string;
  productId: string | null;
  groupId: string | null;
  label: string;
  kind: 'product' | 'group';
  quantity: number;
  chosenVendorId: string | null;
  offers: Offer[];
  lowest: Offer | null;
  next: Offer | null;
  effective: Offer | null;
  lineTotalLow: number;
  lineTotalMid: number;
};

async function loadOffers(
  ctx: { db: import('../../db').Db },
  productIds: string[]
): Promise<Offer[]> {
  if (!productIds.length) return [];
  const rows = await ctx.db
    .select({
      productId: productPrices.productId,
      price: productPrices.price,
      vendorId: productPrices.vendorId,
      vendorName: vendors.name,
      productName: products.name,
    })
    .from(productPrices)
    .innerJoin(vendors, eq(productPrices.vendorId, vendors.id))
    .innerJoin(products, eq(productPrices.productId, products.id))
    .where(inArray(productPrices.productId, productIds));
  return rows
    .map((r) => ({
      productId: r.productId,
      price: num(r.price),
      vendorId: r.vendorId,
      vendorName: r.vendorName,
      productName: r.productName,
    }))
    .sort((a, b) => a.price - b.price);
}

async function getOrCreateDraft(ctx: { db: import('../../db').Db }, workspaceId: string) {
  const [draft] = await ctx.db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.workspaceId, workspaceId), eq(purchaseOrders.status, 'draft')))
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(1);
  if (draft) return draft;
  const [created] = await ctx.db
    .insert(purchaseOrders)
    .values({ workspaceId, status: 'draft' })
    .returning();
  return created!;
}

async function compareOrder(
  ctx: { db: import('../../db').Db },
  orderId: string
): Promise<{ lines: CompareLine[]; totalLow: number; totalMid: number }> {
  const stored = await ctx.db
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.orderId, orderId))
    .orderBy(asc(purchaseOrderLines.sortOrder), asc(purchaseOrderLines.id));

  if (!stored.length) return { lines: [], totalLow: 0, totalMid: 0 };

  const groupIds = stored.filter((l) => l.groupId).map((l) => l.groupId!);
  const groupMembers = groupIds.length
    ? await ctx.db.select().from(products).where(inArray(products.groupId, groupIds))
    : [];

  // Resolve targets per line: a substitute group is treated as one purchasable need,
  // so its offers span every member product.
  const lineTargets = stored.map((line) => {
    if (line.groupId) {
      const members = groupMembers.filter((m) => m.groupId === line.groupId);
      return { line, productIds: members.map((m) => m.id) };
    }
    return { line, productIds: line.productId ? [line.productId] : [] };
  });

  const allIds = [...new Set(lineTargets.flatMap((t) => t.productIds))];
  const allOffers = await loadOffers(ctx, allIds);
  const offersByProduct = new Map<string, Offer[]>();
  for (const o of allOffers) {
    const list = offersByProduct.get(o.productId) ?? [];
    list.push(o);
    offersByProduct.set(o.productId, list);
  }

  const labelMap = new Map<string, string>();
  if (groupIds.length) {
    const groups = await ctx.db
      .select()
      .from(productGroups)
      .where(inArray(productGroups.id, groupIds));
    for (const g of groups) labelMap.set(g.id, g.label);
  }

  let totalLow = 0;
  let totalMid = 0;
  const lines: CompareLine[] = lineTargets.map(({ line, productIds: ids }) => {
    const offers = ids
      .flatMap((id) => offersByProduct.get(id) ?? [])
      .sort((a, b) => a.price - b.price);
    const lowest = offers[0] ?? null;
    const next =
      offers.find(
        (o) => !(lowest && o.productId === lowest.productId && o.vendorId === lowest.vendorId)
      ) ?? null;
    const chosen = line.chosenVendorId
      ? (offers.find((o) => o.vendorId === line.chosenVendorId) ?? null)
      : null;
    const effective = chosen ?? lowest;
    const quantity = line.quantity;

    // Low scenario uses the effective (possibly overridden) pick; mid scenario uses the next-best option.
    const midBase = next ?? effective;
    const lineTotalLow = effective ? effective.price * quantity : 0;
    const lineTotalMid = midBase ? midBase.price * quantity : 0;
    totalLow += lineTotalLow;
    totalMid += lineTotalMid;

    const kind: 'product' | 'group' = line.groupId ? 'group' : 'product';
    const label = line.groupId
      ? (labelMap.get(line.groupId) ?? 'Substitute group')
      : (offers[0]?.productName ?? 'Product');

    return {
      lineId: line.id,
      productId: line.productId,
      groupId: line.groupId,
      label,
      kind,
      quantity,
      chosenVendorId: line.chosenVendorId,
      offers,
      lowest,
      next,
      effective,
      lineTotalLow: Math.round(lineTotalLow * 100) / 100,
      lineTotalMid: Math.round(lineTotalMid * 100) / 100,
    };
  });

  return {
    lines,
    totalLow: Math.round(totalLow * 100) / 100,
    totalMid: Math.round(totalMid * 100) / 100,
  };
}

export const procureRouter = router({
  /** Current draft order with the full lowest-vs-next-option comparison. */
  getDraft: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      const [draft] = await ctx.db
        .select()
        .from(purchaseOrders)
        .where(
          and(eq(purchaseOrders.workspaceId, input.workspaceId), eq(purchaseOrders.status, 'draft'))
        )
        .orderBy(desc(purchaseOrders.createdAt))
        .limit(1);
      if (!draft)
        return {
          orderId: null as string | null,
          lines: [],
          totalLow: 0,
          totalMid: 0,
          updatedAt: null,
        };
      const { lines, totalLow, totalMid } = await compareOrder(ctx, draft.id);
      return {
        orderId: draft.id,
        lines,
        totalLow,
        totalMid,
        updatedAt: draft.createdAt.toISOString(),
      };
    }),

  /** Replace the draft selection (used by the Edit picker and by Suggestions "add to order"). */
  setLines: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        lines: z
          .array(
            z.object({
              productId: z.string().optional(),
              groupId: z.string().optional(),
              quantity: z.number().int().min(1).max(99_999).default(1),
              chosenVendorId: z.string().nullable().optional(),
            })
          )
          .max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      const draft = await getOrCreateDraft(ctx, input.workspaceId);
      const existing = await ctx.db
        .select()
        .from(purchaseOrderLines)
        .where(eq(purchaseOrderLines.orderId, draft.id));
      if (existing.length) {
        await ctx.db.delete(purchaseOrderLines).where(eq(purchaseOrderLines.orderId, draft.id));
      }
      if (input.lines.length) {
        await ctx.db.insert(purchaseOrderLines).values(
          input.lines.map((line, i) => ({
            orderId: draft.id,
            productId: line.productId ?? null,
            groupId: line.groupId ?? null,
            chosenVendorId: line.chosenVendorId ?? null,
            quantity: line.quantity,
            sortOrder: i,
          }))
        );
      }
      const { lines, totalLow, totalMid } = await compareOrder(ctx, draft.id);
      await ctx.db
        .update(purchaseOrders)
        .set({ totalLow: totalLow.toFixed(2), totalMid: totalMid.toFixed(2) })
        .where(eq(purchaseOrders.id, draft.id));
      return { orderId: draft.id, lines, totalLow, totalMid };
    }),

  /** Append lines without dropping the existing selection (Suggestions "add to order"). */
  addLines: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        lines: z
          .array(
            z.object({
              productId: z.string().optional(),
              groupId: z.string().optional(),
              quantity: z.number().int().min(1).max(99_999).default(1),
            })
          )
          .max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      const draft = await getOrCreateDraft(ctx, input.workspaceId);
      const existing = await ctx.db
        .select({ productId: purchaseOrderLines.productId, groupId: purchaseOrderLines.groupId })
        .from(purchaseOrderLines)
        .where(eq(purchaseOrderLines.orderId, draft.id));
      const existingKeys = new Set(existing.map((l) => `${l.productId ?? ''}|${l.groupId ?? ''}`));
      const fresh = input.lines.filter(
        (l) => !existingKeys.has(`${l.productId ?? ''}|${l.groupId ?? ''}`)
      );
      if (fresh.length) {
        const count = existing.length;
        await ctx.db.insert(purchaseOrderLines).values(
          fresh.map((line, i) => ({
            orderId: draft.id,
            productId: line.productId ?? null,
            groupId: line.groupId ?? null,
            quantity: line.quantity,
            sortOrder: count + i,
          }))
        );
      }
      const { lines, totalLow, totalMid } = await compareOrder(ctx, draft.id);
      await ctx.db
        .update(purchaseOrders)
        .set({ totalLow: totalLow.toFixed(2), totalMid: totalMid.toFixed(2) })
        .where(eq(purchaseOrders.id, draft.id));
      return { orderId: draft.id, lines, totalLow, totalMid, added: fresh.length };
    }),

  updateLine: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        lineId: z.string(),
        quantity: z.number().int().min(1).max(99_999).optional(),
        chosenVendorId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      const [line] = await ctx.db
        .select({ lineId: purchaseOrderLines.id, orderId: purchaseOrderLines.orderId })
        .from(purchaseOrderLines)
        .innerJoin(purchaseOrders, eq(purchaseOrderLines.orderId, purchaseOrders.id))
        .where(
          and(
            eq(purchaseOrderLines.id, input.lineId),
            eq(purchaseOrders.workspaceId, input.workspaceId)
          )
        )
        .limit(1);
      if (!line) throw new TRPCError({ code: 'NOT_FOUND', message: 'Line not found' });

      const patch: Partial<typeof purchaseOrderLines.$inferInsert> = {};
      if (input.quantity !== undefined) patch.quantity = input.quantity;
      if (input.chosenVendorId !== undefined) patch.chosenVendorId = input.chosenVendorId;
      await ctx.db
        .update(purchaseOrderLines)
        .set(patch)
        .where(eq(purchaseOrderLines.id, input.lineId));

      const { totalLow, totalMid } = await compareOrder(ctx, line.orderId);
      await ctx.db
        .update(purchaseOrders)
        .set({ totalLow: totalLow.toFixed(2), totalMid: totalMid.toFixed(2) })
        .where(eq(purchaseOrders.id, line.orderId));
      return { ok: true as const };
    }),

  removeLine: protectedProcedure
    .input(z.object({ workspaceId: z.string(), lineId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      const [line] = await ctx.db
        .select({ orderId: purchaseOrderLines.orderId })
        .from(purchaseOrderLines)
        .innerJoin(purchaseOrders, eq(purchaseOrderLines.orderId, purchaseOrders.id))
        .where(
          and(
            eq(purchaseOrderLines.id, input.lineId),
            eq(purchaseOrders.workspaceId, input.workspaceId)
          )
        )
        .limit(1);
      if (!line) throw new TRPCError({ code: 'NOT_FOUND', message: 'Line not found' });
      await ctx.db.delete(purchaseOrderLines).where(eq(purchaseOrderLines.id, input.lineId));
      const { totalLow, totalMid } = await compareOrder(ctx, line.orderId);
      await ctx.db
        .update(purchaseOrders)
        .set({ totalLow: totalLow.toFixed(2), totalMid: totalMid.toFixed(2) })
        .where(eq(purchaseOrders.id, line.orderId));
      return { ok: true as const };
    }),

  /** Finalize the draft into a real purchase order and record purchase history for cadence. */
  generate: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      const [draft] = await ctx.db
        .select()
        .from(purchaseOrders)
        .where(
          and(eq(purchaseOrders.workspaceId, input.workspaceId), eq(purchaseOrders.status, 'draft'))
        )
        .orderBy(desc(purchaseOrders.createdAt))
        .limit(1);
      if (!draft)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No draft order to generate' });

      const { lines, totalLow, totalMid } = await compareOrder(ctx, draft.id);
      if (!lines.length)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Add products to the order first' });

      const now = new Date();
      await ctx.db
        .update(purchaseOrders)
        .set({
          status: 'finalized',
          totalLow: totalLow.toFixed(2),
          totalMid: totalMid.toFixed(2),
          finalizedAt: now,
        })
        .where(eq(purchaseOrders.id, draft.id));

      // Persist computed values on the lines for the export payload.
      for (const line of lines) {
        await ctx.db
          .update(purchaseOrderLines)
          .set({
            unitPrice: (line.effective?.price ?? 0).toFixed(2),
            lineTotal: line.lineTotalLow.toFixed(2),
            chosenVendorId: line.effective?.vendorId ?? line.chosenVendorId,
          })
          .where(eq(purchaseOrderLines.id, line.lineId));
        if (line.effective) {
          await ctx.db.insert(purchaseEvents).values({
            workspaceId: input.workspaceId,
            productId: line.effective.productId,
            vendorId: line.effective.vendorId,
            orderId: draft.id,
            quantity: line.quantity,
            unitPrice: line.effective.price.toFixed(2),
            purchasedAt: now,
          });
        }
      }

      // Start a fresh draft so the procure screen is ready for the next order.
      await ctx.db
        .insert(purchaseOrders)
        .values({ workspaceId: input.workspaceId, status: 'draft' });

      return {
        orderId: draft.id,
        createdAt: draft.createdAt.toISOString(),
        finalizedAt: now.toISOString(),
        totalLow,
        totalMid,
        lines: lines.map((l) => ({
          lineId: l.lineId,
          label: l.label,
          kind: l.kind,
          quantity: l.quantity,
          vendorId: l.effective?.vendorId ?? null,
          vendorName: l.effective?.vendorName ?? 'Unassigned',
          unitPrice: l.effective?.price ?? 0,
          lineTotalLow: l.lineTotalLow,
          lineTotalMid: l.lineTotalMid,
          nextPrice: l.next?.price ?? null,
          nextVendorName: l.next?.vendorName ?? null,
        })),
      };
    }),

  listOrders: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      const rows = await ctx.db
        .select({
          id: purchaseOrders.id,
          totalLow: purchaseOrders.totalLow,
          totalMid: purchaseOrders.totalMid,
          createdAt: purchaseOrders.createdAt,
          finalizedAt: purchaseOrders.finalizedAt,
          lineCount: sql<number>`count(${purchaseOrderLines.id})::int`,
        })
        .from(purchaseOrders)
        .leftJoin(purchaseOrderLines, eq(purchaseOrderLines.orderId, purchaseOrders.id))
        .where(
          and(
            eq(purchaseOrders.workspaceId, input.workspaceId),
            eq(purchaseOrders.status, 'finalized')
          )
        )
        .groupBy(purchaseOrders.id)
        .orderBy(desc(purchaseOrders.createdAt))
        .limit(50);
      return rows.map((o) => ({
        id: o.id,
        totalLow: num(o.totalLow),
        totalMid: num(o.totalMid),
        lineCount: o.lineCount,
        createdAt: o.createdAt.toISOString(),
        finalizedAt: o.finalizedAt?.toISOString() ?? null,
      }));
    }),

  /** A single finalized order with its stored line items (for history + re-order). */
  getOrder: protectedProcedure
    .input(z.object({ workspaceId: z.string(), orderId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      const [order] = await ctx.db
        .select()
        .from(purchaseOrders)
        .where(
          and(
            eq(purchaseOrders.id, input.orderId),
            eq(purchaseOrders.workspaceId, input.workspaceId)
          )
        )
        .limit(1);
      if (!order) throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });

      const lines = await ctx.db
        .select({
          lineId: purchaseOrderLines.id,
          productId: purchaseOrderLines.productId,
          groupId: purchaseOrderLines.groupId,
          productName: products.name,
          groupLabel: productGroups.label,
          vendorId: purchaseOrderLines.chosenVendorId,
          vendorName: vendors.name,
          quantity: purchaseOrderLines.quantity,
          unitPrice: purchaseOrderLines.unitPrice,
          lineTotal: purchaseOrderLines.lineTotal,
        })
        .from(purchaseOrderLines)
        .leftJoin(products, eq(products.id, purchaseOrderLines.productId))
        .leftJoin(productGroups, eq(productGroups.id, purchaseOrderLines.groupId))
        .leftJoin(vendors, eq(vendors.id, purchaseOrderLines.chosenVendorId))
        .where(eq(purchaseOrderLines.orderId, order.id))
        .orderBy(asc(purchaseOrderLines.sortOrder), asc(purchaseOrderLines.id));

      return {
        id: order.id,
        status: order.status,
        createdAt: order.createdAt.toISOString(),
        finalizedAt: order.finalizedAt?.toISOString() ?? null,
        totalLow: num(order.totalLow),
        totalMid: num(order.totalMid),
        lines: lines.map((line) => ({
          lineId: line.lineId,
          productId: line.productId,
          groupId: line.groupId,
          kind: line.groupId ? ('group' as const) : ('product' as const),
          label: line.groupLabel ?? line.productName ?? 'Product',
          vendorId: line.vendorId,
          vendorName: line.vendorName ?? 'Unassigned',
          quantity: line.quantity,
          unitPrice: line.unitPrice === null ? 0 : num(line.unitPrice),
          lineTotal: line.lineTotal === null ? 0 : num(line.lineTotal),
        })),
      };
    }),
});
