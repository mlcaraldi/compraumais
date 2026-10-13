import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  customers,
  orderLines,
  orders,
  products,
  promotionItems,
  promotions,
  suggestionItems,
  suggestionOutcomes,
  suggestionRuns,
} from "@/server/db/schema";
import { dashboardCsv, getDashboard, resolvePeriod } from "@/server/services/dashboard";
import { closeDb, resetTestDb } from "../helpers/db";

let ctx: Awaited<ReturnType<typeof resetTestDb>>;
beforeAll(async () => {
  ctx = await resetTestDb();
});
afterAll(closeDb);

describe("painel", () => {
  it("resolve o período: padrão de 30 dias e datas invertidas", () => {
    const now = new Date("2026-10-13T15:00:00Z");
    expect(resolvePeriod(undefined, undefined, now)).toEqual({
      from: "2026-09-14",
      to: "2026-10-13",
    });
    expect(resolvePeriod("2026-10-10", "2026-10-01")).toEqual({
      from: "2026-10-01",
      to: "2026-10-10",
    });
  });

  it("10 pedidos, 6 com sugestão, 4 enviados, 2 aceitos: os números batem", async () => {
    const { db, tenantId } = ctx;
    const [cust] = await db
      .insert(customers)
      .values({ tenantId, externalCode: "1", legalName: "CAFE LTDA", tradeName: "CAFE UM" })
      .returning();
    const prod = async (code: string, price: number) =>
      (
        await db
          .insert(products)
          .values({ tenantId, code, description: `PRODUTO ${code}`, listPriceCents: price })
          .returning()
      )[0]!;
    const molho = await prod("molho", 4000);
    const chantilly = await prod("chantilly", 7000);
    const velho = await prod("velho", 1000);
    const [promo] = await db
      .insert(promotions)
      .values({ tenantId, name: "Semana", startsOn: "2026-10-01", endsOn: "2026-10-31" })
      .returning();
    const [pi] = await db
      .insert(promotionItems)
      .values({
        tenantId,
        promotionId: promo!.id,
        productId: molho.id,
        rawDescription: "molho",
        priceCents: 3500,
        priceUnit: "un",
      })
      .returning();

    // pedido anterior (fora do período) em que o cliente já comprou o chantilly
    const mk = async (n: string, issuedAt: string, productId?: string) => {
      const [o] = await db
        .insert(orders)
        .values({
          tenantId,
          externalNumber: n,
          customerId: cust!.id,
          issuedAt: new Date(issuedAt),
          status: "confirmed",
        })
        .returning();
      if (productId)
        await db.insert(orderLines).values({ tenantId, orderId: o!.id, productId, qty: "1" });
      return o!.id;
    };
    await mk("antigo", "2026-08-01T15:00:00Z", chantilly.id);

    const run = async (orderId: string, items: { productId: string; promo?: boolean }[]) => {
      const [r] = await db
        .insert(suggestionRuns)
        .values({ tenantId, orderId, engineVersion: "t", settingsSnapshot: {} })
        .returning();
      for (const [rank, i] of items.entries())
        await db.insert(suggestionItems).values({
          tenantId,
          runId: r!.id,
          list: "A",
          productId: i.productId,
          promotionItemId: i.promo ? pi!.id : null,
          priceCents: i.promo ? 3500 : 7000,
          rank,
        });
      return r!.id;
    };
    const outcome = (runId: string, result: string, sent: boolean, accepted: string[] = []) =>
      db.insert(suggestionOutcomes).values({
        tenantId,
        runId,
        sent,
        result,
        acceptedProductIds: accepted,
      });

    const ids: string[] = [];
    for (let i = 1; i <= 10; i++)
      ids.push(await mk(`P${i}`, `2026-10-${String(i).padStart(2, "0")}T15:00:00Z`));
    // 6 com sugestão: P1 e P2 aceitos, P3 recusado, P4 sem resposta, P5 e P6 sem envio
    const r1 = await run(ids[0]!, [
      { productId: molho.id, promo: true },
      { productId: chantilly.id },
    ]);
    await outcome(r1, "accepted", true, [molho.id, chantilly.id]);
    const r2 = await run(ids[1]!, [{ productId: velho.id }, { productId: molho.id, promo: true }]);
    await outcome(r2, "partial", true, [molho.id]);
    const r3 = await run(ids[2]!, [{ productId: molho.id, promo: true }]);
    await outcome(r3, "declined", true);
    const r4 = await run(ids[3]!, [{ productId: chantilly.id }]);
    await outcome(r4, "no_response", true);
    await run(ids[4]!, [{ productId: velho.id }]);
    const r6 = await run(ids[5]!, [{ productId: velho.id }]);
    await outcome(r6, "not_sent", false);

    const d = await getDashboard(db, tenantId, { from: "2026-10-01", to: "2026-10-31" });
    expect(d).toMatchObject({
      processed: 10,
      withSuggestion: 6,
      sent: 4,
      accepted: 2,
      acceptRate: 0.5,
      // P1: molho 35,00 + chantilly 70,00; P2: molho 35,00
      acceptedValueCents: 3500 + 7000 + 3500,
      // chantilly já foi comprado antes; molho e o aceite do P2 são novos
      newToMix: 2,
    });
    expect(d.topOffers).toEqual([
      expect.objectContaining({ productId: molho.id, suggested: 3, accepted: 2 }),
    ]);

    const empty = await getDashboard(db, tenantId, { from: "2026-11-01", to: "2026-11-30" });
    expect(empty).toMatchObject({ processed: 0, sent: 0, acceptRate: null });

    const csv = dashboardCsv(d);
    expect(csv.split("\r\n")).toHaveLength(12); // cabeçalho + 10 pedidos + quebra final
    expect(csv).toContain(
      "P1;CAFE UM;2026-10-01;2;sim;accepted;PRODUTO molho | PRODUTO chantilly;105,00",
    );
  });
});
