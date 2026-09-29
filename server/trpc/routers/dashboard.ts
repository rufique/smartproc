import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { priceHistory, products, purchaseEvents, uploads, vendors } from '../../db/schema';
import { num, requireWorkspace } from '../../lib/guard';
import { protectedProcedure, router } from '../init';

const DAY_MS = 24 * 60 * 60 * 1000;

type RestockItem = {
  productId: string;
  name: string;
  daysLeft: number;
  stockQty: number;
  urgencyPct: number;
};

/** Consumption-based restock urgency: stock ÷ (typical qty per typical interval). */
export async function computeRestock(
  ctx: { db: import('../../db').Db },
  workspaceId: string
): Promise<RestockItem[]> {
  const [tracked, events] = await Promise.all([
    ctx.db
      .select({
        id: products.id,
        name: products.name,
        stockQty: products.stockQty,
      })
      .from(products)
      .where(eq(products.workspaceId, workspaceId)),
    ctx.db
      .select({
        productId: purchaseEvents.productId,
        quantity: purchaseEvents.quantity,
        purchasedAt: purchaseEvents.purchasedAt,
      })
      .from(purchaseEvents)
      .where(eq(purchaseEvents.workspaceId, workspaceId))
      .orderBy(desc(purchaseEvents.purchasedAt)),
  ]);

  const byProduct = new Map<string, typeof events>();
  for (const e of events) {
    const list = byProduct.get(e.productId) ?? [];
    list.push(e);
    byProduct.set(e.productId, list);
  }

  const items: RestockItem[] = [];
  for (const product of tracked) {
    if (product.stockQty === null) continue;
    const history = byProduct.get(product.id) ?? [];
    if (history.length < 2) continue;
    const ordered = [...history].sort((a, b) => a.purchasedAt.getTime() - b.purchasedAt.getTime());
    let intervalSum = 0;
    for (let i = 1; i < ordered.length; i++) {
      intervalSum +=
        (ordered[i].purchasedAt.getTime() - ordered[i - 1].purchasedAt.getTime()) / DAY_MS;
    }
    const avgInterval = Math.max(intervalSum / Math.max(ordered.length - 1, 1), 1);
    const avgQty = ordered.reduce((sum, e) => sum + e.quantity, 0) / ordered.length;
    const perDay = Math.max(avgQty / avgInterval, 0.0001);
    const daysLeft = Math.max(Math.round(num(product.stockQty) / perDay), 0);
    items.push({
      productId: product.id,
      name: product.name,
      daysLeft,
      stockQty: num(product.stockQty),
      urgencyPct: Math.min(Math.max((14 - daysLeft) / 14, 0.1) * 100, 95),
    });
  }
  return items.sort((a, b) => a.daysLeft - b.daysLeft);
}

export const dashboardRouter = router({
  summary: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const ws = await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);

      const [productRows, vendorRows, restock, historyRows, uploadRows] = await Promise.all([
        ctx.db
          .select({ id: products.id })
          .from(products)
          .where(eq(products.workspaceId, input.workspaceId)),
        ctx.db
          .select({ id: vendors.id })
          .from(vendors)
          .where(eq(vendors.workspaceId, input.workspaceId)),
        computeRestock(ctx, input.workspaceId),
        ctx.db
          .select({
            id: priceHistory.id,
            price: priceHistory.price,
            previousPrice: priceHistory.previousPrice,
            recordedAt: priceHistory.recordedAt,
            productId: priceHistory.productId,
            vendorId: priceHistory.vendorId,
            productName: products.name,
            vendorName: vendors.name,
          })
          .from(priceHistory)
          .innerJoin(products, eq(products.id, priceHistory.productId))
          .innerJoin(vendors, eq(vendors.id, priceHistory.vendorId))
          .where(eq(priceHistory.workspaceId, input.workspaceId))
          .orderBy(desc(priceHistory.recordedAt))
          .limit(12),
        ctx.db
          .select()
          .from(uploads)
          .where(eq(uploads.workspaceId, input.workspaceId))
          .orderBy(desc(uploads.createdAt))
          .limit(5),
      ]);

      const priceChanges = historyRows.map((h) => {
        const price = num(h.price);
        const previous = h.previousPrice === null ? null : num(h.previousPrice);
        const changePct =
          previous && previous !== 0 ? Math.round(((price - previous) / previous) * 1000) / 10 : 0;
        return {
          id: h.id,
          productId: h.productId,
          productName: h.productName ?? 'Product',
          vendorName: h.vendorName ?? 'Vendor',
          price,
          previousPrice: previous,
          changePct,
          recordedAt: h.recordedAt.toISOString(),
        };
      });

      const latestUpload = uploadRows[0]
        ? {
            id: uploadRows[0].id,
            fileName: uploadRows[0].fileName,
            createdAt: uploadRows[0].createdAt.toISOString(),
          }
        : null;

      return {
        workspace: { id: ws.id, name: ws.name, industry: ws.industry, currency: ws.currency },
        skuCount: productRows.length,
        vendorCount: vendorRows.length,
        restock: restock.slice(0, 6),
        priceChanges: priceChanges.slice(0, 6),
        latestUpload,
      };
    }),

  restockAll: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      return computeRestock(ctx, input.workspaceId);
    }),

  priceFeed: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      const rows = await ctx.db
        .select({
          id: priceHistory.id,
          price: priceHistory.price,
          previousPrice: priceHistory.previousPrice,
          recordedAt: priceHistory.recordedAt,
          productId: priceHistory.productId,
          vendorId: priceHistory.vendorId,
          productName: products.name,
          vendorName: vendors.name,
        })
        .from(priceHistory)
        .innerJoin(products, eq(products.id, priceHistory.productId))
        .innerJoin(vendors, eq(vendors.id, priceHistory.vendorId))
        .where(eq(priceHistory.workspaceId, input.workspaceId))
        .orderBy(desc(priceHistory.recordedAt))
        .limit(100);

      return rows.map((h) => {
        const price = num(h.price);
        const previous = h.previousPrice === null ? null : num(h.previousPrice);
        const changePct =
          previous && previous !== 0 ? Math.round(((price - previous) / previous) * 1000) / 10 : 0;
        return {
          id: h.id,
          productId: h.productId,
          productName: h.productName ?? 'Product',
          vendorName: h.vendorName ?? 'Vendor',
          price,
          previousPrice: previous,
          changePct,
          recordedAt: h.recordedAt.toISOString(),
        };
      });
    }),
});
