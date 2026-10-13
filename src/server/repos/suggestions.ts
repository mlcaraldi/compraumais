import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  customerRecipes,
  customers,
  ingredientProducts,
  ingredients,
  orderLines,
  orders,
  products,
  recipeItems,
  recipes,
  segments,
  suggestionItems,
  suggestionMessages,
  suggestionOutcomes,
  suggestionRuns,
} from "../db/schema";
import { requireTenant } from "./tenant";

export type SuggestionRun = typeof suggestionRuns.$inferSelect;
export type SuggestionItem = typeof suggestionItems.$inferSelect;
export type SuggestionMessage = typeof suggestionMessages.$inferSelect;
export type SuggestionOutcome = typeof suggestionOutcomes.$inferSelect;

/** Tudo o que o motor precisa de cadastro, já filtrado por tenant. */
export async function loadEngineCatalog(db: Db, tenantId: string, customerId: string) {
  requireTenant(tenantId);
  const links = await db
    .select({
      recipeId: customerRecipes.recipeId,
      portionsPerDay: customerRecipes.portionsPerDay,
    })
    .from(customerRecipes)
    .where(
      and(
        eq(customerRecipes.tenantId, tenantId),
        eq(customerRecipes.customerId, customerId),
        eq(customerRecipes.confirmed, true),
      ),
    );
  const recipeIds = links.map((l) => l.recipeId);
  const recipeRows = recipeIds.length
    ? await db
        .select()
        .from(recipes)
        .where(and(eq(recipes.tenantId, tenantId), inArray(recipes.id, recipeIds)))
    : [];
  const items = recipeIds.length
    ? await db
        .select()
        .from(recipeItems)
        .where(and(eq(recipeItems.tenantId, tenantId), inArray(recipeItems.recipeId, recipeIds)))
    : [];
  const ingredientIds = [...new Set(items.map((i) => i.ingredientId))];
  const ingredientRows = ingredientIds.length
    ? await db
        .select({ id: ingredients.id, isCommodity: ingredients.isCommodity })
        .from(ingredients)
        .where(and(eq(ingredients.tenantId, tenantId), inArray(ingredients.id, ingredientIds)))
    : [];
  const approved = ingredientIds.length
    ? await db
        .select({
          ingredientId: ingredientProducts.ingredientId,
          productId: ingredientProducts.productId,
          priority: ingredientProducts.priority,
        })
        .from(ingredientProducts)
        .where(
          and(
            eq(ingredientProducts.tenantId, tenantId),
            eq(ingredientProducts.status, "approved"),
            inArray(ingredientProducts.ingredientId, ingredientIds),
          ),
        )
    : [];
  return { links, recipeRows, items, ingredientRows, approved };
}

export async function getCustomerWithSegment(db: Db, tenantId: string, customerId: string) {
  requireTenant(tenantId);
  const [row] = await db
    .select({ customer: customers, segmentCode: segments.code })
    .from(customers)
    .leftJoin(segments, eq(segments.id, customers.segmentId))
    .where(and(eq(customers.tenantId, tenantId), eq(customers.id, customerId)));
  return row ?? null;
}

export async function listProductsByIds(db: Db, tenantId: string, ids: string[]) {
  requireTenant(tenantId);
  if (!ids.length) return [];
  return db
    .select()
    .from(products)
    .where(and(eq(products.tenantId, tenantId), inArray(products.id, ids)));
}

/** Linhas dos pedidos confirmados do cliente anteriores à data, mais recentes primeiro. */
export async function listCustomerHistory(
  db: Db,
  tenantId: string,
  customerId: string,
  before: Date,
  excludeOrderId: string,
  maxOrders = 60,
) {
  requireTenant(tenantId);
  const recent = await db
    .select({ id: orders.id, issuedAt: orders.issuedAt })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.customerId, customerId),
        eq(orders.status, "confirmed"),
        lt(orders.issuedAt, before),
        sql`${orders.id} <> ${excludeOrderId}`,
      ),
    )
    .orderBy(desc(orders.issuedAt), desc(orders.createdAt))
    .limit(maxOrders);
  if (!recent.length) return [];
  const byId = new Map(recent.map((o) => [o.id, o.issuedAt]));
  const lines = await db
    .select({
      orderId: orderLines.orderId,
      productId: orderLines.productId,
      qty: orderLines.qty,
    })
    .from(orderLines)
    .where(
      and(
        eq(orderLines.tenantId, tenantId),
        inArray(orderLines.orderId, [...byId.keys()]),
        sql`${orderLines.productId} is not null`,
      ),
    );
  const order = new Map(recent.map((o, i) => [o.id, i]));
  return lines
    .map((l) => ({
      orderId: l.orderId,
      productId: l.productId!,
      qty: Number(l.qty),
      date: byId.get(l.orderId)!,
    }))
    .sort((a, b) => order.get(a.orderId)! - order.get(b.orderId)!);
}

/** Produtos recusados pelo cliente: tudo o que foi sugerido em rodadas "declined", ou o que sobrou em "partial". */
export async function listCustomerDeclines(db: Db, tenantId: string, customerId: string) {
  requireTenant(tenantId);
  const rows = await db
    .select({
      result: suggestionOutcomes.result,
      accepted: suggestionOutcomes.acceptedProductIds,
      at: suggestionOutcomes.createdAt,
      productId: suggestionItems.productId,
    })
    .from(suggestionOutcomes)
    .innerJoin(suggestionRuns, eq(suggestionRuns.id, suggestionOutcomes.runId))
    .innerJoin(orders, eq(orders.id, suggestionRuns.orderId))
    .innerJoin(suggestionItems, eq(suggestionItems.runId, suggestionRuns.id))
    .where(
      and(
        eq(suggestionOutcomes.tenantId, tenantId),
        eq(orders.customerId, customerId),
        inArray(suggestionOutcomes.result, ["declined", "partial"]),
        sql`${suggestionItems.list} <> 'reminder'`,
      ),
    );
  return rows
    .filter((r) => r.result === "declined" || !r.accepted.includes(r.productId))
    .map((r) => ({ productId: r.productId, date: r.at }));
}

export type NewRunItem = Omit<typeof suggestionItems.$inferInsert, "tenantId" | "id" | "runId">;

export async function createRun(
  db: Db,
  tenantId: string,
  run: {
    orderId: string;
    engineVersion: string;
    settingsSnapshot: unknown;
    outputMeta: unknown;
  },
  items: NewRunItem[],
  messageText: string,
) {
  requireTenant(tenantId);
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(suggestionRuns)
      .values({ ...run, tenantId })
      .returning();
    if (items.length)
      await tx
        .insert(suggestionItems)
        .values(items.map((i) => ({ ...i, tenantId, runId: created!.id })));
    await tx.insert(suggestionMessages).values({ tenantId, runId: created!.id, text: messageText });
    return created!;
  });
}

export async function getLatestRun(db: Db, tenantId: string, orderId: string) {
  requireTenant(tenantId);
  const [row] = await db
    .select()
    .from(suggestionRuns)
    .where(and(eq(suggestionRuns.tenantId, tenantId), eq(suggestionRuns.orderId, orderId)))
    .orderBy(desc(suggestionRuns.createdAt))
    .limit(1);
  return row ?? null;
}

export async function listRunItems(db: Db, tenantId: string, runId: string) {
  requireTenant(tenantId);
  return db
    .select({ item: suggestionItems, product: products })
    .from(suggestionItems)
    .innerJoin(products, eq(products.id, suggestionItems.productId))
    .where(and(eq(suggestionItems.tenantId, tenantId), eq(suggestionItems.runId, runId)))
    .orderBy(suggestionItems.rank);
}

export async function getRunMessage(db: Db, tenantId: string, runId: string) {
  requireTenant(tenantId);
  const [row] = await db
    .select()
    .from(suggestionMessages)
    .where(and(eq(suggestionMessages.tenantId, tenantId), eq(suggestionMessages.runId, runId)))
    .orderBy(desc(suggestionMessages.createdAt))
    .limit(1);
  return row ?? null;
}

export async function saveEditedMessage(
  db: Db,
  tenantId: string,
  messageId: string,
  editedText: string | null,
) {
  requireTenant(tenantId);
  await db
    .update(suggestionMessages)
    .set({ editedText })
    .where(and(eq(suggestionMessages.tenantId, tenantId), eq(suggestionMessages.id, messageId)));
}

export async function listRunOutcomes(db: Db, tenantId: string, runId: string) {
  requireTenant(tenantId);
  return db
    .select()
    .from(suggestionOutcomes)
    .where(and(eq(suggestionOutcomes.tenantId, tenantId), eq(suggestionOutcomes.runId, runId)))
    .orderBy(desc(suggestionOutcomes.createdAt));
}

export async function recordOutcome(
  db: Db,
  tenantId: string,
  v: {
    runId: string;
    sent: boolean;
    result: string;
    acceptedProductIds: string[];
    note: string | null;
    recordedBy: string | null;
  },
) {
  requireTenant(tenantId);
  await db.insert(suggestionOutcomes).values({
    ...v,
    tenantId,
    sentAt: v.sent ? new Date() : null,
  });
}
