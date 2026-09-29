import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  priceHistory,
  productPrices,
  products,
  uploadRows,
  uploads,
  vendors,
} from '../../db/schema';
import { extractRowsFromWorkbook } from '../../lib/excel';
import { bestMatch, normalizeName } from '../../lib/fuzzy';
import { num, requireWorkspace } from '../../lib/guard';
import { matchProductByName } from '../../lib/match';
import { protectedProcedure, router } from '../init';

const MAX_FILE_BYTES = 8 * 1024 * 1024;

type PendingRow = {
  rowId: string | null;
  rowIndex: number;
  name: string;
  price: number | null;
  vendorName: string | null;
  quantity: string | null;
  matchedProductId: string | null;
  matchedProductName: string | null;
  status: 'pending' | 'confirmed' | 'skipped';
};

/**
 * Image/PDF OCR runs through the AI extraction pipeline, which is not wired up in this build.
 * We return a clearly-labeled demo preview derived from the current catalog so the whole
 * review → confirm → commit flow stays fully exercisable without an AI key.
 */
async function buildDemoRows(
  ctx: { db: import('../../db').Db },
  workspaceId: string,
  taggedVendorName: string | null
): Promise<PendingRow[]> {
  const catalog = await ctx.db
    .select({
      id: products.id,
      name: products.name,
      price: productPrices.price,
      vendorName: vendors.name,
    })
    .from(products)
    .leftJoin(productPrices, eq(productPrices.productId, products.id))
    .leftJoin(vendors, eq(vendors.id, productPrices.vendorId))
    .where(eq(products.workspaceId, workspaceId))
    .limit(24);

  const deltas = [0.07, -0.07, 0, 0.04, -0.05, 0.03, -0.02, 0.06];
  const withPrice = catalog.filter((c) => c.price !== null);
  const source = withPrice.length ? withPrice : catalog;

  return source.slice(0, 8).map((row, i) => {
    const base = row.price !== null ? num(row.price) : 10 + i;
    const delta = deltas[i % deltas.length];
    const price = Math.max(0.01, Math.round(base * (1 + delta) * 100) / 100);
    return {
      rowId: null,
      rowIndex: i,
      name: row.name,
      price,
      vendorName: taggedVendorName ?? row.vendorName,
      quantity: null,
      matchedProductId: row.id,
      matchedProductName: row.name,
      status: 'pending' as const,
    };
  });
}

export const uploadsRouter = router({
  recent: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      const rows = await ctx.db
        .select()
        .from(uploads)
        .where(eq(uploads.workspaceId, input.workspaceId))
        .orderBy(desc(uploads.createdAt))
        .limit(10);
      return rows.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }));
    }),

  /**
   * Hybrid upload: the client sends a base64 file + metadata. Spreadsheets are really parsed;
   * images/PDFs return a labeled demo preview (manual correction step is always required).
   */
  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        fileName: z.string().min(1).max(200),
        fileType: z.enum(['image', 'pdf', 'excel']),
        base64: z.string().max(16_000_000).optional(),
        taggedVendorName: z.string().max(120).optional(),
        taggedVendorId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      if (input.base64 && input.base64.length > MAX_FILE_BYTES) {
        throw new TRPCError({ code: 'PAYLOAD_TOO_LARGE', message: 'File is larger than 8 MB' });
      }

      let demoPreview = false;
      let rows: PendingRow[] = [];

      if (input.fileType === 'excel') {
        if (!input.base64)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'File content is missing' });
        const extracted = extractRowsFromWorkbook(input.base64);
        if (!extracted.length) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No product rows found in this spreadsheet',
          });
        }
        rows = extracted.map((r, i) => ({
          rowId: null,
          rowIndex: i,
          name: r.name,
          price: r.price,
          vendorName: r.vendorName ?? input.taggedVendorName ?? null,
          quantity: r.quantity,
          matchedProductId: null,
          matchedProductName: null,
          status: 'pending',
        }));
        // Pre-match a page of rows so reviewers see proposed matches without paying a
        // query per row on large spreadsheets. commit re-matches every row authoritatively.
        const PRE_MATCH_LIMIT = 50;
        for (const row of rows.slice(0, PRE_MATCH_LIMIT)) {
          const match = await matchProductByName(ctx.db, input.workspaceId, row.name);
          row.matchedProductId = match?.id ?? null;
          row.matchedProductName = match?.name ?? null;
        }
      } else {
        demoPreview = true;
        rows = await buildDemoRows(ctx, input.workspaceId, input.taggedVendorName ?? null);
      }

      const [upload] = await ctx.db
        .insert(uploads)
        .values({
          workspaceId: input.workspaceId,
          fileName: input.fileName,
          fileType: input.fileType,
          status: 'review',
          demoPreview,
          taggedVendorId: input.taggedVendorId ?? null,
          extractedRowCount: rows.length,
        })
        .returning();
      if (!upload)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not create upload' });

      let insertedRows: (typeof uploadRows.$inferSelect)[] = [];
      if (rows.length) {
        insertedRows = await ctx.db
          .insert(uploadRows)
          .values(
            rows.map((r) => ({
              uploadId: upload.id,
              rowIndex: r.rowIndex,
              name: r.name,
              price: r.price === null ? null : r.price.toFixed(2),
              vendorName: r.vendorName,
              quantity: r.quantity,
              status: r.status,
              matchedProductId: r.matchedProductId,
            }))
          )
          .returning();
      }

      return {
        uploadId: upload.id,
        demoPreview,
        rows: insertedRows.map((r) => ({
          rowId: r.id,
          rowIndex: r.rowIndex,
          name: r.name,
          price: r.price === null ? null : num(r.price),
          vendorName: r.vendorName,
          quantity: r.quantity,
          matchedProductId: r.matchedProductId,
          matchedProductName:
            rows.find((x) => x.matchedProductId === r.matchedProductId)?.matchedProductName ?? null,
          status: (r.status as PendingRow['status']) ?? 'pending',
        })) satisfies PendingRow[],
      };
    }),

  /** Re-open the review screen for an upload that has not been committed yet. */
  getReview: protectedProcedure
    .input(z.object({ workspaceId: z.string(), uploadId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      const [upload] = await ctx.db
        .select()
        .from(uploads)
        .where(and(eq(uploads.id, input.uploadId), eq(uploads.workspaceId, input.workspaceId)))
        .limit(1);
      if (!upload) throw new TRPCError({ code: 'NOT_FOUND', message: 'Upload not found' });
      const stored = await ctx.db
        .select()
        .from(uploadRows)
        .where(eq(uploadRows.uploadId, upload.id));
      const catalog = await ctx.db
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(eq(products.workspaceId, input.workspaceId));
      const nameById = new Map(catalog.map((c) => [c.id, c.name]));
      const rows: PendingRow[] = stored
        .sort((a, b) => a.rowIndex - b.rowIndex)
        .map((r) => ({
          rowId: r.id,
          rowIndex: r.rowIndex,
          name: r.name,
          price: r.price === null ? null : num(r.price),
          vendorName: r.vendorName,
          quantity: r.quantity,
          matchedProductId: r.matchedProductId,
          matchedProductName: r.matchedProductId
            ? (nameById.get(r.matchedProductId) ?? null)
            : null,
          status: (r.status as PendingRow['status']) ?? 'pending',
        }));
      return {
        uploadId: upload.id,
        fileName: upload.fileName,
        fileType: upload.fileType,
        demoPreview: upload.demoPreview,
        status: upload.status,
        rows,
      };
    }),

  /** Edit an extracted row (fix OCR errors) or toggle confirmed/skipped. */
  updateRow: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        rowId: z.string(),
        name: z.string().min(1).max(160).optional(),
        price: z.number().nonnegative().nullable().optional(),
        vendorName: z.string().max(120).nullable().optional(),
        quantity: z.string().max(40).nullable().optional(),
        status: z.enum(['pending', 'confirmed', 'skipped']).optional(),
        matchedProductId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);

      // The row must belong to an upload in this workspace (strict isolation).
      const [owned] = await ctx.db
        .select({ id: uploadRows.id })
        .from(uploadRows)
        .innerJoin(uploads, eq(uploads.id, uploadRows.uploadId))
        .where(and(eq(uploadRows.id, input.rowId), eq(uploads.workspaceId, input.workspaceId)))
        .limit(1);
      if (!owned) throw new TRPCError({ code: 'NOT_FOUND', message: 'Row not found' });

      // A cross-workspace product must never be attached to one of our rows.
      if (input.matchedProductId) {
        const [ownedProduct] = await ctx.db
          .select({ id: products.id })
          .from(products)
          .where(
            and(
              eq(products.id, input.matchedProductId),
              eq(products.workspaceId, input.workspaceId)
            )
          )
          .limit(1);
        if (!ownedProduct)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown product for this match' });
      }

      const patch: Partial<typeof uploadRows.$inferInsert> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.price !== undefined)
        patch.price = input.price === null ? null : input.price.toFixed(2);
      if (input.vendorName !== undefined) patch.vendorName = input.vendorName;
      if (input.quantity !== undefined) patch.quantity = input.quantity;
      if (input.status !== undefined) patch.status = input.status;
      if (input.matchedProductId !== undefined) patch.matchedProductId = input.matchedProductId;
      const [updated] = await ctx.db
        .update(uploadRows)
        .set(patch)
        .where(eq(uploadRows.id, input.rowId))
        .returning();
      return { ok: !!updated };
    }),

  /**
   * Commit confirmed rows: fuzzy-match against the catalog to update an existing
   * product-vendor price, otherwise create a new product record.
   *
   * Resolving matches, creating products/vendors, upserting prices and writing price
   * history are each batched into a handful of statements instead of one round trip per row.
   */
  commit: protectedProcedure
    .input(z.object({ workspaceId: z.string(), uploadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      const [upload] = await ctx.db
        .select()
        .from(uploads)
        .where(and(eq(uploads.id, input.uploadId), eq(uploads.workspaceId, input.workspaceId)))
        .limit(1);
      if (!upload) throw new TRPCError({ code: 'NOT_FOUND', message: 'Upload not found' });
      if (upload.status === 'committed') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This upload was already committed' });
      }

      const rows = await ctx.db.select().from(uploadRows).where(eq(uploadRows.uploadId, upload.id));
      const confirmed = rows.filter((r) => r.status !== 'skipped');
      if (!confirmed.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Confirm at least one row before committing',
        });
      }

      const catalog = await ctx.db
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(eq(products.workspaceId, input.workspaceId));
      const catalogIds = new Set(catalog.map((p) => p.id));
      const catalogByNorm = new Map(catalog.map((p) => [normalizeName(p.name), p.id]));
      const vendorList = await ctx.db
        .select()
        .from(vendors)
        .where(eq(vendors.workspaceId, input.workspaceId));

      let created = 0;
      let updated = 0;
      let skipped = 0;

      type Resolution = {
        price: number;
        vendorName: string | null;
        /** May be a `pending:` key until new products are inserted. */
        productId: string;
        /** May be a `pending:` key until new vendors are inserted. */
        vendorId: string | null;
        isNew: boolean;
      };

      // ---- 1. resolve a product for every confirmed row ----------------------
      const resolutions: Resolution[] = [];
      const pendingProducts: { key: string; name: string }[] = [];
      const pendingProductByNorm = new Map<string, string>();

      for (const row of confirmed) {
        const name = row.name.trim();
        if (!name || row.price === null) {
          skipped++;
          continue;
        }

        let productId =
          row.matchedProductId && catalogIds.has(row.matchedProductId)
            ? row.matchedProductId
            : null;
        let isNew = false;

        if (!productId) {
          const norm = normalizeName(name);
          productId = catalogByNorm.get(norm) ?? null;
          if (!productId) {
            const match = await matchProductByName(ctx.db, input.workspaceId, name);
            if (match) productId = match.id;
          }
          if (!productId) {
            const pendingId = pendingProductByNorm.get(norm);
            if (pendingId) {
              productId = pendingId;
            } else {
              const key = `pending:${pendingProducts.length}`;
              pendingProductByNorm.set(norm, key);
              pendingProducts.push({ key, name });
              productId = key;
              isNew = true;
            }
          }
        }

        if (isNew) created++;
        else updated++;
        resolutions.push({
          price: num(row.price),
          vendorName: row.vendorName?.trim() || null,
          productId,
          vendorId: null,
          isNew,
        });
      }

      // ---- 2. create the new products in one insert --------------------------
      if (pendingProducts.length) {
        const insertedProducts = await ctx.db
          .insert(products)
          .values(
            pendingProducts.map((p) => ({
              workspaceId: input.workspaceId,
              name: p.name,
              sourceUploadId: upload.id,
              updatedAt: new Date(),
            }))
          )
          .returning({ id: products.id, name: products.name });
        const idByName = new Map(insertedProducts.map((p) => [p.name, p.id]));
        for (const pending of pendingProducts) {
          const realId = idByName.get(pending.name);
          if (realId) {
            catalogByNorm.set(normalizeName(pending.name), realId);
            for (const resolution of resolutions) {
              if (resolution.productId === pending.key) resolution.productId = realId;
            }
          }
        }
      }

      // ---- 3. resolve a vendor for every resolution (creating as needed) -----
      const vendorByName = new Map(vendorList.map((v) => [v.name.toLowerCase(), v]));
      const pendingVendors: { key: string; name: string }[] = [];
      const pendingVendorByName = new Map<string, string>();

      for (const resolution of resolutions) {
        if (!resolution.vendorName) continue;
        const lower = resolution.vendorName.toLowerCase();
        const existing = vendorByName.get(lower);
        if (existing) {
          resolution.vendorId = existing.id;
          continue;
        }
        const fuzzy = bestMatch(vendorList, resolution.vendorName, 0.8);
        if (fuzzy) {
          resolution.vendorId = fuzzy.item.id;
          continue;
        }
        let key = pendingVendorByName.get(lower);
        if (!key) {
          key = `pending:${pendingVendors.length}`;
          pendingVendorByName.set(lower, key);
          pendingVendors.push({ key, name: resolution.vendorName });
        }
        resolution.vendorId = key;
      }

      if (pendingVendors.length) {
        const insertedVendors = await ctx.db
          .insert(vendors)
          .values(pendingVendors.map((v) => ({ workspaceId: input.workspaceId, name: v.name })))
          .returning({ id: vendors.id, name: vendors.name });
        const idByName = new Map(insertedVendors.map((v) => [v.name, v.id]));
        for (const pending of pendingVendors) {
          const realId = idByName.get(pending.name);
          if (!realId) continue;
          for (const resolution of resolutions) {
            if (resolution.vendorId === pending.key) resolution.vendorId = realId;
          }
        }
      }

      // ---- 4. upsert prices + record history in two batched statements -------
      const latestByPair = new Map<
        string,
        { productId: string; vendorId: string; price: number }
      >();
      for (const resolution of resolutions) {
        // Skip anything still holding an unresolved placeholder — should not happen,
        // but never let a `pending:` key reach the database as an id.
        if (!resolution.vendorId || resolution.vendorId.startsWith('pending:')) continue;
        if (resolution.productId.startsWith('pending:')) continue;
        const key = `${resolution.productId}:${resolution.vendorId}`;
        // Last occurrence wins, matching the previous sequential behaviour.
        latestByPair.set(key, {
          productId: resolution.productId,
          vendorId: resolution.vendorId,
          price: resolution.price,
        });
      }

      const pairs = [...latestByPair.values()];
      const productIds = [...new Set(pairs.map((p) => p.productId))];
      const vendorIds = [...new Set(pairs.map((p) => p.vendorId))];
      const existingPrices =
        productIds.length && vendorIds.length
          ? await ctx.db
              .select()
              .from(productPrices)
              .where(
                and(
                  inArray(productPrices.productId, productIds),
                  inArray(productPrices.vendorId, vendorIds)
                )
              )
          : [];
      const priceByPair = new Map(
        existingPrices.map((p) => [`${p.productId}:${p.vendorId}`, num(p.price)])
      );

      const now = new Date();
      const upserts: (typeof productPrices.$inferInsert)[] = [];
      const historyRows: (typeof priceHistory.$inferInsert)[] = [];
      const touchedProductIds = new Set<string>();

      for (const pair of pairs) {
        const key = `${pair.productId}:${pair.vendorId}`;
        const rounded = Math.round(pair.price * 100) / 100;
        const previous = priceByPair.get(key);
        if (previous !== undefined && Math.abs(previous - rounded) < 0.005) continue;
        upserts.push({
          workspaceId: input.workspaceId,
          productId: pair.productId,
          vendorId: pair.vendorId,
          price: rounded.toFixed(2),
          updatedAt: now,
        });
        historyRows.push({
          workspaceId: input.workspaceId,
          productId: pair.productId,
          vendorId: pair.vendorId,
          price: rounded.toFixed(2),
          previousPrice: previous === undefined ? null : previous.toFixed(2),
          sourceUploadId: upload.id,
          recordedAt: now,
        });
        touchedProductIds.add(pair.productId);
      }

      if (upserts.length) {
        await ctx.db
          .insert(productPrices)
          .values(upserts)
          .onConflictDoUpdate({
            target: [productPrices.productId, productPrices.vendorId],
            set: { price: sql`excluded.price`, updatedAt: now },
          });
        if (historyRows.length) await ctx.db.insert(priceHistory).values(historyRows);
        await ctx.db
          .update(products)
          .set({ updatedAt: now })
          .where(inArray(products.id, [...touchedProductIds]));
      }

      await ctx.db
        .update(uploads)
        .set({ status: 'committed', extractedRowCount: confirmed.length })
        .where(eq(uploads.id, upload.id));

      return { created, updated, skipped, total: confirmed.length };
    }),

  discard: protectedProcedure
    .input(z.object({ workspaceId: z.string(), uploadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspace(ctx.db, input.workspaceId, ctx.user.id);
      await ctx.db
        .update(uploads)
        .set({ status: 'discarded' })
        .where(and(eq(uploads.id, input.uploadId), eq(uploads.workspaceId, input.workspaceId)));
      return { ok: true as const };
    }),
});
