import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
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

export type OrderSummary = {
  orderId: string;
  externalNumber: string;
  customerId: string;
  customerName: string;
  issuedAt: Date;
  suggestionCount: number;
  sent: boolean;
  result: string | null;
  acceptedProductIds: string[];
  items: {
    productId: string;
    description: string;
    list: string;
    priceCents: number | null;
    promotionItemId: string | null;
  }[];
  /** produtos aceitos que o cliente nunca tinha comprado antes deste pedido */
  newToMix: string[];
};

/**
 * Um resumo por pedido confirmado emitido em [from, to) (instantes). Usa a rodada mais recente
 * de cada pedido e o último resultado registrado nela.
 */
export async function listOrderSummaries(
  db: Db,
  tenantId: string,
  from: Date,
  to: Date,
): Promise<OrderSummary[]> {
  requireTenant(tenantId);
  const rows = await db
    .select({
      id: orders.id,
      number: orders.externalNumber,
      customerId: orders.customerId,
      issuedAt: orders.issuedAt,
      trade: customers.tradeName,
      legal: customers.legalName,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.status, "confirmed"),
        gte(orders.issuedAt, from),
        lt(orders.issuedAt, to),
      ),
    )
    .orderBy(orders.issuedAt);
  if (!rows.length) return [];
  const orderIds = rows.map((r) => r.id);

  const runs = await db.execute<{ id: string; order_id: string }>(sql`
    select distinct on (order_id) id, order_id from ${suggestionRuns}
    where tenant_id = ${tenantId} and order_id in (${sql.join(
      orderIds.map((i) => sql`${i}`),
      sql`, `,
    )})
    order by order_id, created_at desc`);
  const runByOrder = new Map(runs.rows.map((r) => [r.order_id, r.id]));
  const runIds = [...runByOrder.values()];

  const items = runIds.length
    ? await db
        .select({
          runId: suggestionItems.runId,
          productId: suggestionItems.productId,
          list: suggestionItems.list,
          priceCents: suggestionItems.priceCents,
          promotionItemId: suggestionItems.promotionItemId,
          description: products.description,
        })
        .from(suggestionItems)
        .innerJoin(products, eq(products.id, suggestionItems.productId))
        .where(and(eq(suggestionItems.tenantId, tenantId), inArray(suggestionItems.runId, runIds)))
    : [];
  const outcomes = runIds.length
    ? await db
        .select()
        .from(suggestionOutcomes)
        .where(
          and(eq(suggestionOutcomes.tenantId, tenantId), inArray(suggestionOutcomes.runId, runIds)),
        )
        .orderBy(suggestionOutcomes.createdAt)
    : [];

  // histórico anterior de cada cliente, só para os produtos aceitos
  const accepted = outcomes.flatMap((o) => o.acceptedProductIds);
  const bought = accepted.length
    ? await db
        .select({
          customerId: orders.customerId,
          productId: orderLines.productId,
          issuedAt: orders.issuedAt,
        })
        .from(orderLines)
        .innerJoin(orders, eq(orders.id, orderLines.orderId))
        .where(
          and(
            eq(orders.tenantId, tenantId),
            eq(orders.status, "confirmed"),
            inArray(orderLines.productId, [...new Set(accepted)]),
            inArray(orders.customerId, [...new Set(rows.map((r) => r.customerId))]),
          ),
        )
    : [];

  return rows.map((o) => {
    const runId = runByOrder.get(o.id);
    const its = items.filter((i) => i.runId === runId && i.list !== "reminder");
    const outs = outcomes.filter((x) => x.runId === runId);
    const last = outs.at(-1) ?? null;
    const acceptedIds = last?.acceptedProductIds ?? [];
    return {
      orderId: o.id,
      externalNumber: o.number,
      customerId: o.customerId,
      customerName: o.trade ?? o.legal,
      issuedAt: o.issuedAt,
      suggestionCount: its.length,
      sent: outs.some((x) => x.sent),
      result: last?.result ?? null,
      acceptedProductIds: acceptedIds,
      items: its,
      newToMix: acceptedIds.filter(
        (pid) =>
          !bought.some(
            (b) => b.customerId === o.customerId && b.productId === pid && b.issuedAt < o.issuedAt,
          ),
      ),
    };
  });
}
