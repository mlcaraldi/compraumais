import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  customerRecipes,
  customers,
  ingredientProducts,
  ingredients,
  orderLines,
  orders,
  products,
  promotionItems,
  promotions,
  recipeItems,
  recipes,
} from "@/server/db/schema";
import { runSuggestionJob } from "@/server/jobs/handlers";
import { suggestionsRepo } from "@/server/repos";
import { runSuggestionsForOrder, SuggestionError } from "@/server/services/suggestions";
import { closeDb, resetTestDb } from "../helpers/db";

let ctx: Awaited<ReturnType<typeof resetTestDb>>;
const ids: Record<string, string> = {};
const NOW = new Date("2026-10-07T15:00:00Z");

beforeAll(async () => {
  ctx = await resetTestDb();
  const { db, tenantId } = ctx;
  const prod = async (key: string, description: string, over: Record<string, unknown> = {}) => {
    const [p] = await db
      .insert(products)
      .values({
        tenantId,
        code: key,
        description,
        listPriceCents: 1000,
        saleUnit: "un",
        ...over,
      })
      .returning();
    ids[key] = p!.id;
  };
  await prod("pao", "PAO AUSTRALIANO 5UN");
  await prod("molho", "MOLHO GRILL ZAFRAN 1,01KG", { listPriceCents: 4025 });
  await prod("chantilly", "CHANTILLY CHEF E CO 1KG");
  const [c] = await db
    .insert(customers)
    .values({
      tenantId,
      externalCode: "1",
      legalName: "CULTURA LTDA",
      tradeName: "CAFE CULTURA",
      phoneE164: "+5554999314042",
      phoneKind: "mobile",
    })
    .returning();
  ids.customer = c!.id;
  const [r] = await db
    .insert(recipes)
    .values({ tenantId, name: "Sanduíche Australiano" })
    .returning();
  ids.recipe = r!.id;
  for (const [key, name, anchor] of [
    ["pao", "pao australiano", true],
    ["molho", "molho grill", false],
  ] as const) {
    const [ing] = await db
      .insert(ingredients)
      .values({ tenantId, name, normalizedName: name })
      .returning();
    await db.insert(recipeItems).values({
      tenantId,
      recipeId: r!.id,
      ingredientId: ing!.id,
      qtyPerPortion: "10",
      unit: "g",
      isAnchor: anchor,
    });
    await db.insert(ingredientProducts).values({
      tenantId,
      ingredientId: ing!.id,
      productId: ids[key]!,
      status: "approved",
    });
  }
  await db.insert(customerRecipes).values({ tenantId, customerId: c!.id, recipeId: r!.id });
  const [promo] = await db
    .insert(promotions)
    .values({ tenantId, name: "Semana", startsOn: "2026-10-05", endsOn: "2026-10-12" })
    .returning();
  await db.insert(promotionItems).values({
    tenantId,
    promotionId: promo!.id,
    productId: ids.molho!,
    rawDescription: "MOLHO GRILL",
    priceCents: 3590,
    priceUnit: "un",
  });
});
afterAll(closeDb);

async function order(number: string, status: "draft" | "confirmed", productKey: string) {
  const [o] = await ctx.db
    .insert(orders)
    .values({
      tenantId: ctx.tenantId,
      externalNumber: number,
      customerId: ids.customer!,
      issuedAt: NOW,
      status,
    })
    .returning();
  await ctx.db.insert(orderLines).values({
    tenantId: ctx.tenantId,
    orderId: o!.id,
    productId: ids[productKey]!,
    qty: "2",
    unitPriceCents: 1000,
  });
  return o!.id;
}

describe("sugestões a partir de um pedido confirmado", () => {
  it("gera rodada com itens, aviso e mensagem, e recalcular cria outra rodada", async () => {
    const orderId = await order("100", "confirmed", "pao");
    const run = await runSuggestionsForOrder(ctx.db, ctx.tenantId, orderId, NOW);
    const items = await suggestionsRepo.listRunItems(ctx.db, ctx.tenantId, run.id);
    expect(items.map((i) => [i.item.list, i.product.code, i.item.priceCents])).toEqual([
      ["A", "molho", 3590],
    ]);
    const msg = await suggestionsRepo.getRunMessage(ctx.db, ctx.tenantId, run.id);
    expect(msg?.text).toContain(
      "faltou Molho Grill Zafran 1,01kg: R$ 35,90/un, em oferta até 12/10.",
    );
    expect(run.outputMeta).toEqual({ warnings: [], pendencies: [] });

    const again = await runSuggestionsForOrder(ctx.db, ctx.tenantId, orderId, NOW);
    expect(again.id).not.toBe(run.id);
    expect((await suggestionsRepo.getLatestRun(ctx.db, ctx.tenantId, orderId))?.id).toBe(again.id);
  });

  it("o job usa o mesmo caminho; recusa registrada tira o produto da rodada seguinte", async () => {
    const orderId = await order("101", "confirmed", "pao");
    await runSuggestionJob(ctx.db, { tenantId: ctx.tenantId, orderId });
    const run = (await suggestionsRepo.getLatestRun(ctx.db, ctx.tenantId, orderId))!;
    await suggestionsRepo.recordOutcome(ctx.db, ctx.tenantId, {
      runId: run.id,
      sent: true,
      result: "declined",
      acceptedProductIds: [],
      note: null,
      recordedBy: null,
    });
    const next = await runSuggestionsForOrder(ctx.db, ctx.tenantId, orderId, new Date());
    expect(await suggestionsRepo.listRunItems(ctx.db, ctx.tenantId, next.id)).toEqual([]);
  });

  it("recusa pedido não confirmado e pedido de outro tenant", async () => {
    const draft = await order("102", "draft", "pao");
    await expect(runSuggestionsForOrder(ctx.db, ctx.tenantId, draft, NOW)).rejects.toBeInstanceOf(
      SuggestionError,
    );
    const confirmed = await order("103", "confirmed", "pao");
    await expect(
      runSuggestionsForOrder(ctx.db, "00000000-0000-0000-0000-000000000000", confirmed, NOW),
    ).rejects.toBeInstanceOf(SuggestionError);
  });
});
