import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { products } from "../db/schema";
import { requireTenant } from "./tenant";

export type Product = typeof products.$inferSelect;
export type ProductUpsert = Omit<
  typeof products.$inferInsert,
  "tenantId" | "id" | "createdAt" | "updatedAt"
>;

export async function listProductCodes(db: Db, tenantId: string) {
  requireTenant(tenantId);
  return db
    .select({ id: products.id, code: products.code })
    .from(products)
    .where(eq(products.tenantId, tenantId));
}

export async function countProducts(db: Db, tenantId: string) {
  requireTenant(tenantId);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.tenantId, tenantId));
  return row?.n ?? 0;
}

export async function getProductById(db: Db, tenantId: string, id: string) {
  requireTenant(tenantId);
  const [row] = await db
    .select()
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.id, id)));
  return row ?? null;
}

export async function listProducts(
  db: Db,
  tenantId: string,
  f: { q?: string; source?: string; sellable?: boolean; offset?: number; limit?: number } = {},
) {
  requireTenant(tenantId);
  const q = f.q?.trim();
  const where = and(
    eq(products.tenantId, tenantId),
    f.source ? eq(products.source, f.source) : undefined,
    f.sellable === undefined ? undefined : eq(products.sellable, f.sellable),
    q
      ? or(
          ilike(products.code, `${q}%`),
          ilike(products.searchText, `%${q.toUpperCase()}%`),
          ilike(products.description, `%${q}%`),
        )
      : undefined,
  );
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(where);
  const rows = await db
    .select()
    .from(products)
    .where(where)
    .orderBy(asc(products.description))
    .offset(f.offset ?? 0)
    .limit(f.limit ?? 50);
  return { rows, total: n };
}

export async function updateProduct(
  db: Db,
  tenantId: string,
  id: string,
  patch: Partial<Omit<ProductUpsert, "code">>,
) {
  requireTenant(tenantId);
  await db
    .update(products)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(products.tenantId, tenantId), eq(products.id, id)));
}

/** Insere ou atualiza por (tenant, código). Mantém `source` e `sellable` de produtos existentes. */
export async function upsertProducts(db: Db, tenantId: string, rows: ProductUpsert[]) {
  requireTenant(tenantId);
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, tenantId }));
    if (!chunk.length) continue;
    await db
      .insert(products)
      .values(chunk)
      .onConflictDoUpdate({
        target: [products.tenantId, products.code],
        set: {
          description: sql`excluded.description`,
          brand: sql`coalesce(excluded.brand, ${products.brand})`,
          packText: sql`coalesce(excluded.pack_text, ${products.packText})`,
          packQty: sql`coalesce(excluded.pack_qty, ${products.packQty})`,
          packUnitSize: sql`coalesce(excluded.pack_unit_size, ${products.packUnitSize})`,
          packUnit: sql`coalesce(excluded.pack_unit, ${products.packUnit})`,
          saleUnit: sql`coalesce(excluded.sale_unit, ${products.saleUnit})`,
          listPriceCents: sql`coalesce(excluded.list_price_cents, ${products.listPriceCents})`,
          priceUpdatedAt: sql`case when excluded.list_price_cents is not null then now() else ${products.priceUpdatedAt} end`,
          category: sql`coalesce(excluded.category, ${products.category})`,
          searchText: sql`excluded.search_text`,
          updatedAt: sql`now()`,
        },
      });
  }
}
