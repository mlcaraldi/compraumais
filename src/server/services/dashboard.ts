import type { Db } from "../db/client";
import { dashboardRepo } from "../repos";
import type { OrderSummary } from "../repos/dashboard";
import { addDaysIso, todayIso } from "../normalize";

export type Period = { from: string; to: string };

/** Período padrão: últimos 30 dias, incluindo hoje. */
export function resolvePeriod(from?: string, to?: string, now = new Date()): Period {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const end = to && iso.test(to) ? to : todayIso(now);
  const start = from && iso.test(from) ? from : addDaysIso(end, -29);
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}

const start = (day: string) => new Date(`${day}T00:00:00-03:00`);

export type Dashboard = {
  period: Period;
  processed: number;
  withSuggestion: number;
  sent: number;
  accepted: number;
  /** aceitos (total ou parte) sobre enviados; null sem envios */
  acceptRate: number | null;
  /** soma dos preços de 1 unidade de cada item aceito */
  acceptedValueCents: number;
  newToMix: number;
  topOffers: { productId: string; description: string; suggested: number; accepted: number }[];
  orders: OrderSummary[];
};

export function summarize(period: Period, rows: OrderSummary[]): Dashboard {
  const sentRows = rows.filter((r) => r.sent);
  const acceptedRows = sentRows.filter((r) => r.result === "accepted" || r.result === "partial");
  const offers = new Map<
    string,
    { productId: string; description: string; suggested: number; accepted: number }
  >();
  let value = 0;
  for (const r of rows) {
    for (const i of r.items) {
      if (!i.promotionItemId) continue;
      const cur = offers.get(i.productId) ?? {
        productId: i.productId,
        description: i.description,
        suggested: 0,
        accepted: 0,
      };
      cur.suggested += 1;
      if (r.sent && r.acceptedProductIds.includes(i.productId)) cur.accepted += 1;
      offers.set(i.productId, cur);
    }
    if (r.sent)
      for (const i of r.items)
        if (r.acceptedProductIds.includes(i.productId)) value += i.priceCents ?? 0;
  }
  return {
    period,
    processed: rows.length,
    withSuggestion: rows.filter((r) => r.suggestionCount > 0).length,
    sent: sentRows.length,
    accepted: acceptedRows.length,
    acceptRate: sentRows.length ? acceptedRows.length / sentRows.length : null,
    acceptedValueCents: value,
    newToMix: acceptedRows.reduce((n, r) => n + r.newToMix.length, 0),
    topOffers: [...offers.values()]
      .filter((o) => o.accepted > 0)
      .sort((a, b) => b.accepted - a.accepted || b.suggested - a.suggested)
      .slice(0, 5),
    orders: rows,
  };
}

export async function getDashboard(db: Db, tenantId: string, period: Period) {
  const rows = await dashboardRepo.listOrderSummaries(
    db,
    tenantId,
    start(period.from),
    start(addDaysIso(period.to, 1)),
  );
  return summarize(period, rows);
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV com ponto e vírgula e vírgula decimal, para abrir direto no Excel em português. */
export function dashboardCsv(d: Dashboard): string {
  const brl = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const head = [
    "pedido",
    "cliente",
    "data",
    "sugestoes",
    "enviada",
    "resultado",
    "itens_aceitos",
    "valor_aceito_rs",
  ];
  const lines = d.orders.map((r) => {
    const acceptedItems = r.items.filter(
      (i) => r.sent && r.acceptedProductIds.includes(i.productId),
    );
    return [
      r.externalNumber,
      r.customerName,
      todayIso(r.issuedAt),
      r.suggestionCount,
      r.sent ? "sim" : "não",
      r.result ?? "",
      acceptedItems.map((i) => i.description).join(" | "),
      brl(acceptedItems.reduce((s, i) => s + (i.priceCents ?? 0), 0)),
    ]
      .map(csvCell)
      .join(";");
  });
  return `﻿${[head.join(";"), ...lines].join("\r\n")}\r\n`;
}
