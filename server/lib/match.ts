import { and, eq, sql } from 'drizzle-orm';

import type { Db } from '../db';
import { products } from '../db/schema';
import { bestMatch } from './fuzzy';

/**
 * Trigram-backed catalog matching.
 *
 * Catalog reconciliation used to load every product into memory and scan it per
 * extracted row. Instead we shortlist candidates in Postgres with the `pg_trgm`
 * GIN index, then apply the existing (higher quality) scorer to the shortlist.
 * Falls back to a full in-memory scan if the extension is unavailable.
 */

let ready: Promise<boolean> | null = null;

export function ensureTrigramExtension(db: Db): Promise<boolean> {
  if (!ready) {
    ready = (async () => {
      try {
        await db.execute(sql`create extension if not exists pg_trgm`);
        await db.execute(
          sql`create index if not exists products_name_trgm_idx on products using gin (name gin_trgm_ops)`
        );
        return true;
      } catch (error) {
        console.warn(
          '[match] pg_trgm unavailable — falling back to in-memory matching:',
          error instanceof Error ? error.message : error
        );
        return false;
      }
    })();
  }
  return ready;
}

/** Best matching product for a free-text name within one workspace, or null. */
export async function matchProductByName(
  db: Db,
  workspaceId: string,
  name: string
): Promise<{ id: string; name: string } | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  if (await ensureTrigramExtension(db)) {
    try {
      const shortlist = await db
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(and(eq(products.workspaceId, workspaceId), sql`${products.name} % ${trimmed}`))
        .orderBy(sql`similarity(${products.name}, ${trimmed}) desc`)
        .limit(25);
      const match = bestMatch(shortlist, trimmed);
      return match?.item ?? null;
    } catch (error) {
      console.warn(
        '[match] trigram lookup failed — using in-memory scan:',
        error instanceof Error ? error.message : error
      );
    }
  }

  const all = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(eq(products.workspaceId, workspaceId));
  return bestMatch(all, trimmed)?.item ?? null;
}
