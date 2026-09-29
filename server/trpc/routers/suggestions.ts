import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import {
  productPrices,
  products,
  purchaseEvents,
  purchaseOrderLines,
  purchaseOrders,
  vendors,
} from '../../db/schema';
import { num, requireWorkspace } from '../../lib/guard';
import { protectedProcedure, router } from '../init';

const DAY_MS = 24 * 60 * 60 * 1000;

export function formatCadence(days: number): string {
  if (days < 14) return `every ${Math.max(Math.round(days), 1)} days`;
  if (days < 60) return `every ${Math.round(days / 7)} weeks`;
  return `every ${Math.round(days / 30)} months`;
}

export function monthsAgoLabel(days: number): string {
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 45) return `${days} days ago`;
  const months = Math.round(days / 30);
  return `${months} month${months > 1 ? 's' : ''} ago`;
}

type Suggestion = {
  productId: string;
  name: string;
  category: string;
  vendorName: string | null;
  typicalQty: number;
  intervalDays: number;
  lastPurchasedAt: string;
  daysAgo: number;
  cadenceText: string;
};

async function computeSuggestions(
  ctx: { db: import('../../db').Db },
  workspaceId: string
): Promise<Suggestion[]> {
  const [events, draftLines] = await Promise.all([
    ctx.db
      .select({
        productId: purchaseEvents.productId,
        quantity: purchaseEvents.quantity,
        purchasedAt: purchaseEvents.purchasedAt,
      })
      .from(purchaseEvents)
      .where(eq(purchaseEvents.workspaceId, workspaceId)),
    ctx.db
      .select({ productId: purchaseOrderLines.productId, groupId: purchaseOrderLines.groupId })
      .from(purchaseOrderLines)
      .innerJoin(purchaseOrders, eq(purchaseOrderLines.orderId, purchaseOrders.id))
      .where(
        // only the draft order defines "the current draft order"
        and(eq(purchaseOrders.workspaceId, workspaceId), eq(purchaseOrders.status, 'draft'))
      ),
  ]);

  // Products already on the (draft) order are never suggested.
  const draftProductIds = new Set(draftLines.filter((l) => l.productId).map((l) => l.productId!));
  const draftGroupIds = draftLines.filter((l) => l.groupId).map((l) => l.groupId!);
  if (draftGroupIds.length) {
    const members = await ctx.db
      .select({ id: products.id })
      .from(products)
      .where(inArray(products.groupId, draftGroupIds));
    for (const m of members) draftProductIds.add(m.id);
  }

  const byProduct = new Map<string, typeof events>();
  for (const e of events) {
    const list = byProduct.get(e.productId) ?? [];
    list.push(e);
    byProduct.set(e.productId, list);
  }

  const candidates: { productId: string; intervalDays: number; typicalQty: number; last: Date }[] =
    [];
  for (const [productId, list] of byProduct) {
    if (list.length < 2 || draftProductIds.has(productId)) continue;
    const ordered = [...list].sort((a, b) => a.purchasedAt.getTime() - b.purchasedAt.getTime());
    let intervalSum = 0;
    for (let i = 1; i < ordered.length; i++) {
      intervalSum +=
        (ordered[i].purchasedAt.getTime() - ordered[i - 1].purchasedAt.getTime()) / DAY_MS;
    }
    const intervalDays = intervalSum / Math.max(ordered.length - 1, 1);
    if (intervalDays > 60) continue; // "regular" purchase history only
    const typicalQty = Math.max(
      Math.round(ordered.reduce((sum, e) => sum + e.quantity, 0) / ordered.length),
      1
    );
    candidates.push({
      productId,
      intervalDays,
      typicalQty,
      last: ordered[ordered.length - 1].purchasedAt,
    });
  }

  if (!candidates.length) return [];

  const productRows = await ctx.db
    .select({
      id: products.id,
      name: products.name,
      category: products.category,
    })
    .from(products)
    .where(
      inArray(
        products.id,
        candidates.map((c) => c.productId)
      )
    );
  const productById = new Map(productRows.map((p) => [p.id, p]));

  // cheapest vendor per product for the subtitle
  const priceRows = await ctx.db
    .select({
      productId: productPrices.productId,
      price: productPrices.price,
      vendorName: vendors.name,
    })
    .from(productPrices)
    .innerJoin(vendors, eq(productPrices.vendorId, vendors.id))
    .where(
      inArray(
        productPrices.productId,
        candidates.map((c) => c.productId)
      )
    );
  const cheapest = new Map<string, { name: string; price: number }>();
  for (const row of priceRows) {
    const current = cheapest.get(row.productId);
    const price = num(row.price);
    if (!current || price < current.price)
      cheapest.set(row.productId, { name: row.vendorName, price });
  }

  const now = Date.now();
  const suggestions: Suggestion[] = [];
  for (const candidate of candidates) {
    const product = productById.get(candidate.productId);
    if (!product) continue;
    const daysAgo = Math.max(Math.round((now - candidate.last.getTime()) / DAY_MS), 0);
    suggestions.push({
      productId: candidate.productId,
      name: product.name,
      category: product.category,
      vendorName: cheapest.get(candidate.productId)?.name ?? null,
      typicalQty: candidate.typicalQty,
      intervalDays: Math.round(candidate.intervalDays),
      lastPurchasedAt: candidate.last.toISOString(),
      daysAgo,
      cadenceText: `Usually ${formatCadence(candidate.intervalDays)}, last bought ${monthsAgoLabel(daysAgo)}`,
    });
  }

  // Most overdue relative to their own cadence first.
  return suggestions.sort((a, b) => b.daysAgo / b.intervalDays - a.daysAgo / a.intervalDays);
}

export const suggestionsRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      return computeSuggestions(ctx, input.workspaceId);
    }),

  /** Monthly quantity trend for the top suggested products (drives the chart). */
  trend: protectedProcedure
    .input(z.object({ workspaceId: z.string(), range: z.enum(['6m', '1y', 'all']).default('6m') }))
    .query(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      const suggestions = await computeSuggestions(ctx, input.workspaceId);
      const top = suggestions.slice(0, 3);
      if (!top.length) return { months: [] as string[], series: [] };

      const events = await ctx.db
        .select({
          productId: purchaseEvents.productId,
          quantity: purchaseEvents.quantity,
          purchasedAt: purchaseEvents.purchasedAt,
        })
        .from(purchaseEvents)
        .where(eq(purchaseEvents.workspaceId, input.workspaceId));

      const now = new Date();
      let monthCount: number;
      if (input.range === '6m') {
        monthCount = 6;
      } else if (input.range === '1y') {
        monthCount = 12;
      } else {
        // 'all' — span back to the earliest recorded purchase, capped so the chart stays bounded.
        const earliest = events.reduce(
          (min, event) => Math.min(min, event.purchasedAt.getTime()),
          now.getTime()
        );
        const start = new Date(earliest);
        monthCount =
          (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1;
        monthCount = Math.min(Math.max(monthCount, 1), 36);
      }
      const monthKeys: { key: string; label: string }[] = [];
      for (let i = monthCount - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthKeys.push({
          key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
          label: d.toLocaleString('en-US', { month: 'short' }),
        });
      }

      const series = top.map((s) => {
        const values = monthKeys.map(() => 0);
        for (const event of events) {
          if (event.productId !== s.productId) continue;
          const key = `${event.purchasedAt.getFullYear()}-${String(event.purchasedAt.getMonth() + 1).padStart(2, '0')}`;
          const idx = monthKeys.findIndex((m) => m.key === key);
          if (idx >= 0) values[idx] += event.quantity;
        }
        return { productId: s.productId, name: s.name, values };
      });

      return { months: monthKeys.map((m) => m.label), series };
    }),
});
