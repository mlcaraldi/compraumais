import { and, asc, desc, eq, lte, gte, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { products, promotionItems, promotions } from "../db/schema";
import { requireTenant } from "./tenant";

export type Promotion = typeof promotions.$inferSelect;
export type PromotionItem = typeof promotionItems.$inferSelect;
export type NewPromotion = Omit<
  typeof promotions.$inferInsert,
  "tenantId" | "id" | "createdAt" | "updatedAt"
>;
export type NewPromotionItem = Omit<
  typeof promotionItems.$inferInsert,
  "tenantId" | "id" | "promotionId"
>;

export async function createPromotionWithItems(
  db: Db,
  tenantId: string,
  promotion: NewPromotion,
  items: NewPromotionItem[],
) {
  requireTenant(tenantId);
  const [created] = await db
    .insert(promotions)
    .values({ ...promotion, tenantId })
    .returning();
  if (items.length)
    await db
      .insert(promotionItems)
      .values(items.map((i) => ({ ...i, tenantId, promotionId: created!.id })));
  return created!;
}

export async function findPromotionByDocument(db: Db, tenantId: string, documentId: string) {
  requireTenant(tenantId);
  const [row] = await db
    .select()
    .from(promotions)
    .where(and(eq(promotions.tenantId, tenantId), eq(promotions.documentId, documentId)));
  return row ?? null;
}

export async function getPromotion(db: Db, tenantId: string, id: string) {
  requireTenant(tenantId);
  const [row] = await db
    .select()
    .from(promotions)
    .where(and(eq(promotions.tenantId, tenantId), eq(promotions.id, id)));
  return row ?? null;
}

export async function listPromotions(db: Db, tenantId: string) {
  requireTenant(tenantId);
  return db
    .select({
      promotion: promotions,
      itemCount: sql<number>`(select count(*)::int from ${promotionItems} i where i.promotion_id = ${promotions.id})`,
    })
    .from(promotions)
    .where(eq(promotions.tenantId, tenantId))
    .orderBy(desc(promotions.startsOn), desc(promotions.createdAt))
    .limit(200);
}

export async function listPromotionItems(db: Db, tenantId: string, promotionId: string) {
  requireTenant(tenantId);
  return db
    .select({ item: promotionItems, product: products })
    .from(promotionItems)
    .leftJoin(products, eq(products.id, promotionItems.productId))
    .where(and(eq(promotionItems.tenantId, tenantId), eq(promotionItems.promotionId, promotionId)))
    .orderBy(asc(promotionItems.rawDescription));
}

export async function updatePromotion(
  db: Db,
  tenantId: string,
  id: string,
  patch: Partial<Pick<Promotion, "name" | "startsOn" | "endsOn" | "status" | "conditionsText">>,
) {
  requireTenant(tenantId);
  await db
    .update(promotions)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(promotions.tenantId, tenantId), eq(promotions.id, id)));
}

/** Itens de ofertas ativas na data (AAAA-MM-DD), com produto vinculado. Usado pelo motor. */
export async function listActivePromotionItems(db: Db, tenantId: string, onDate: string) {
  requireTenant(tenantId);
  return db
    .select({ item: promotionItems, promotion: promotions })
    .from(promotionItems)
    .innerJoin(promotions, eq(promotions.id, promotionItems.promotionId))
    .where(
      and(
        eq(promotionItems.tenantId, tenantId),
        eq(promotions.status, "active"),
        lte(promotions.startsOn, onDate),
        gte(promotions.endsOn, onDate),
      ),
    );
}

/** Marca como vencidas as ofertas ativas cujo fim é anterior a `today` (AAAA-MM-DD). */
export async function expireOverdue(db: Db, tenantId: string, today: string) {
  requireTenant(tenantId);
  const rows = await db
    .update(promotions)
    .set({ status: "expired", updatedAt: new Date() })
    .where(
      and(
        eq(promotions.tenantId, tenantId),
        eq(promotions.status, "active"),
        sql`${promotions.endsOn} < ${today}`,
      ),
    )
    .returning({ id: promotions.id });
  return rows.length;
}
