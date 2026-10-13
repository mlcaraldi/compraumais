import type { Db } from "../db/client";
import { buildMessage, runEngine, type EngineInput, type EngineProduct } from "../engine";
import { ordersRepo, promotionsRepo, settingsRepo, suggestionsRepo } from "../repos";
import { todayIso } from "../normalize";

const UNITS = new Set(["g", "ml", "un"]);

export class SuggestionError extends Error {}

/**
 * Gera uma rodada de sugestões para um pedido confirmado: monta a entrada do motor a partir do
 * banco, roda a função pura e grava itens e mensagem. Cada chamada cria uma rodada nova
 * ("Recalcular"); a tela sempre mostra a mais recente.
 */
export async function runSuggestionsForOrder(
  db: Db,
  tenantId: string,
  orderId: string,
  now: Date = new Date(),
) {
  const order = await ordersRepo.getOrder(db, tenantId, orderId);
  if (!order) throw new SuggestionError("Pedido não encontrado");
  if (order.status !== "confirmed") throw new SuggestionError("O pedido ainda não foi confirmado");
  const cw = await suggestionsRepo.getCustomerWithSegment(db, tenantId, order.customerId);
  if (!cw) throw new SuggestionError("Cliente do pedido não encontrado");

  const lines = await ordersRepo.listOrderLines(db, tenantId, orderId);
  const orderLines = lines
    .filter((l) => l.line.productId)
    .map((l) => ({ productId: l.line.productId!, qty: Number(l.line.qty) }));

  const [catalog, history, declines, promos, settings] = await Promise.all([
    suggestionsRepo.loadEngineCatalog(db, tenantId, order.customerId),
    suggestionsRepo.listCustomerHistory(db, tenantId, order.customerId, order.issuedAt, orderId),
    suggestionsRepo.listCustomerDeclines(db, tenantId, order.customerId),
    promotionsRepo.listActivePromotionItems(db, tenantId, todayIso(order.issuedAt)),
    settingsRepo.getEngineSettings(db, tenantId),
  ]);

  const activePromotions: EngineInput["activePromotions"] = promos
    .filter((p) => p.item.productId)
    .map(({ item, promotion }) => ({
      promotionItemId: item.id,
      productId: item.productId!,
      priceCents: item.priceCents,
      priceUnit: item.priceUnit,
      priceType: item.priceType,
      minQty: item.minQty === null ? null : Number(item.minQty),
      endsOn: promotion.endsOn,
      regularPriceCents: item.regularPriceCents,
    }));

  const productIds = new Set<string>([
    ...orderLines.map((l) => l.productId),
    ...history.map((h) => h.productId),
    ...activePromotions.map((p) => p.productId),
    ...catalog.approved.map((a) => a.productId),
  ]);
  const productRows = await suggestionsRepo.listProductsByIds(db, tenantId, [...productIds]);
  const products: Record<string, EngineProduct> = {};
  for (const p of productRows) {
    const total =
      p.packQty !== null && p.packUnitSize !== null
        ? Number(p.packQty) * Number(p.packUnitSize)
        : null;
    products[p.id] = {
      id: p.id,
      description: p.description,
      brand: p.brand,
      sellable: p.sellable,
      packTotal: total && p.packUnit && UNITS.has(p.packUnit) ? total : null,
      packUnit: p.packUnit && UNITS.has(p.packUnit) ? (p.packUnit as "g" | "ml" | "un") : null,
      saleUnit: p.saleUnit as EngineProduct["saleUnit"],
      listPriceCents: p.listPriceCents,
      category: p.category,
    };
  }

  const recipeItems = new Map<string, EngineInput["recipes"][number]["items"]>();
  for (const i of catalog.items) {
    const list = recipeItems.get(i.recipeId) ?? [];
    list.push({
      ingredientId: i.ingredientId,
      qtyPerPortion: Number(i.qtyPerPortion),
      unit: i.unit as "g" | "ml" | "un",
      isAnchor: i.isAnchor,
      isEssential: i.isEssential,
    });
    recipeItems.set(i.recipeId, list);
  }

  const input: EngineInput = {
    now,
    order: { id: order.id, issuedAt: order.issuedAt, lines: orderLines },
    customer: {
      id: cw.customer.id,
      blocked: cw.customer.blocked,
      segmentCode: cw.segmentCode,
      phoneKind: cw.customer.phoneKind ?? "invalid",
    },
    customerRecipes: catalog.links.map((l) => ({
      recipeId: l.recipeId,
      portionsPerDay: l.portionsPerDay === null ? null : Number(l.portionsPerDay),
    })),
    recipes: catalog.recipeRows.map((r) => ({
      id: r.id,
      name: r.name,
      items: recipeItems.get(r.id) ?? [],
    })),
    ingredients: Object.fromEntries(
      catalog.ingredientRows.map((i) => [i.id, { isCommodity: i.isCommodity }]),
    ),
    ingredientProducts: catalog.approved,
    products,
    history,
    activePromotions,
    declines,
    settings,
  };

  const out = runEngine(input);

  const recipeNames = Object.fromEntries(catalog.recipeRows.map((r) => [r.id, { name: r.name }]));
  const text = buildMessage({
    customer: {
      contactName: cw.customer.contactName,
      tradeName: cw.customer.tradeName,
      legalName: cw.customer.legalName,
    },
    order: { issuedAt: order.issuedAt },
    items: out.items.filter((i) => i.list !== "reminder"),
    products,
    recipes: recipeNames,
    now,
  });

  return suggestionsRepo.createRun(
    db,
    tenantId,
    {
      orderId,
      engineVersion: out.engineVersion,
      settingsSnapshot: settings,
      outputMeta: { warnings: out.warnings, pendencies: out.pendencies },
    },
    out.items.map((i, rank) => ({
      list: i.list,
      productId: i.productId,
      recipeIds: i.recipeIds,
      promotionItemId: i.promotionItemId,
      priceCents: i.priceCents,
      priceUnit: i.priceUnit,
      score: String(i.score),
      rank,
      reasons: i.reasons,
    })),
    text,
  );
}
