import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  customers,
  orderLines,
  orders,
  products,
  suggestionItems,
  suggestionOutcomes,
  suggestionRuns,
} from "../db/schema";
import { requireTenant } from "./tenant";

export type Order = typeof orders.$inferSelect;
export type NewOrder = Omit<
  typeof orders.$inferInsert,
  "tenantId" | "id" | "createdAt" | "updatedAt"
>;
export type NewOrderLine = Omit<typeof orderLines.$inferInsert, "tenantId" | "id" | "orderId">;

export async function orderNumberExists(db: Db, tenantId: string, externalNumber: string) {
  requireTenant(tenantId);
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.externalNumber, externalNumber)));
  return !!row;
}

export async function createOrderWithLines(
  db: Db,
  tenantId: string,
  order: NewOrder,
  lines: NewOrderLine[],
) {
  requireTenant(tenantId);
  const [created] = await db
    .insert(orders)
    .values({ ...order, tenantId })
    .returning();
  if (lines.length)
    await db
      .insert(orderLines)
      .values(lines.map((l, i) => ({ ...l, position: i, tenantId, orderId: created!.id })));
  return created!;
}

export async function getOrder(db: Db, tenantId: string, id: string) {
  requireTenant(tenantId);
  const [row] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)));
  return row ?? null;
}

export async function listOrderLines(db: Db, tenantId: string, orderId: string) {
  requireTenant(tenantId);
  return db
    .select({ line: orderLines, product: products })
    .from(orderLines)
    .leftJoin(products, eq(products.id, orderLines.productId))
    .where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, orderId)))
    .orderBy(orderLines.position);
}

export async function listOrders(
  db: Db,
  tenantId: string,
  f: { q?: string; customerId?: string; offset?: number; limit?: number } = {},
) {
  requireTenant(tenantId);
  const q = f.q?.trim();
  const where = and(
    eq(orders.tenantId, tenantId),
    f.customerId ? eq(orders.customerId, f.customerId) : undefined,
    q
      ? or(
          ilike(orders.externalNumber, `%${q}%`),
          ilike(customers.tradeName, `%${q}%`),
          ilike(customers.legalName, `%${q}%`),
        )
      : undefined,
  );
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(where);
  const rows = await db
    .select({
      order: orders,
      customer: customers,
      suggestionCount: sql<number>`(select count(*)::int from ${suggestionItems} si
        where si.run_id = (select r.id from ${suggestionRuns} r where r.order_id = ${orders.id} order by r.created_at desc limit 1)
        and si.list <> 'reminder')`,
      result: sql<string | null>`(select o.result from ${suggestionOutcomes} o
        join ${suggestionRuns} r on r.id = o.run_id
        where r.order_id = ${orders.id} order by o.created_at desc limit 1)`,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(where)
    .orderBy(desc(orders.issuedAt), desc(orders.createdAt))
    .offset(f.offset ?? 0)
    .limit(f.limit ?? 50);
  return { rows, total: n };
}
