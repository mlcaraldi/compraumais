import type {
  EngineInput,
  EngineItem,
  EngineOutput,
  EnginePromotionItem,
  EngineWarning,
  Pendency,
  Reason,
} from "./types";

export const ENGINE_VERSION = "mvp-1";
/** Teto de lembretes na tela; o plano não define, então limitamos para a lista não virar ruído. */
export const MAX_REMINDERS = 5;
const DAY_MS = 86_400_000;
const CATEGORY_WINDOW_DAYS = 90;

const daysBetween = (later: Date, earlier: Date) =>
  Math.floor((later.getTime() - earlier.getTime()) / DAY_MS);

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

type Purchase = { date: Date; qty: number };

/**
 * Motor de sugestões do MVP (seção 8 do plano). Função pura: sem banco, sem rede e sem relógio;
 * a data do pedido ancora cobertura e regularidade, `now` só mede recusas recentes.
 */
export function runEngine(input: EngineInput): EngineOutput {
  const { order, customer, settings } = input;
  const ref = order.issuedAt;
  const warnings: EngineWarning[] = [];
  const pendencies: Pendency[] = [];

  if (customer.blocked) warnings.push("customer_blocked");
  if (customer.phoneKind === "landline" || customer.phoneKind === "invalid")
    warnings.push("no_whatsapp");

  // --- índices ---------------------------------------------------------------------------
  const orderProducts = new Set(order.lines.map((l) => l.productId));
  const recipesById = new Map(input.recipes.map((r) => [r.id, r]));
  const customerRecipes = input.customerRecipes.filter((c) => recipesById.has(c.recipeId));

  const productsByIngredient = new Map<string, { productId: string; priority: number }[]>();
  const ingredientsByProduct = new Map<string, Set<string>>();
  for (const l of input.ingredientProducts) {
    const list = productsByIngredient.get(l.ingredientId) ?? [];
    list.push({ productId: l.productId, priority: l.priority });
    productsByIngredient.set(l.ingredientId, list);
    const set = ingredientsByProduct.get(l.productId) ?? new Set<string>();
    set.add(l.ingredientId);
    ingredientsByProduct.set(l.productId, set);
  }
  for (const list of productsByIngredient.values()) list.sort((a, b) => a.priority - b.priority);

  // histórico por produto (uma compra por pedido), mais recente primeiro
  const purchases = new Map<string, Purchase[]>();
  const orderIdsInOrder: string[] = [];
  const productsByHistoryOrder = new Map<string, Set<string>>();
  for (const h of input.history) {
    if (!productsByHistoryOrder.has(h.orderId)) {
      productsByHistoryOrder.set(h.orderId, new Set());
      orderIdsInOrder.push(h.orderId);
    }
    productsByHistoryOrder.get(h.orderId)!.add(h.productId);
    const list = purchases.get(h.productId) ?? [];
    const same = list.find((p) => p.date.getTime() === h.date.getTime());
    if (same) same.qty += h.qty;
    else list.push({ date: h.date, qty: h.qty });
    purchases.set(h.productId, list);
  }
  for (const list of purchases.values()) list.sort((a, b) => b.date.getTime() - a.date.getTime());

  const windowOrders = orderIdsInOrder.slice(0, settings.regularWindowOrders);
  const hits = (productId: string) =>
    windowOrders.filter((id) => productsByHistoryOrder.get(id)!.has(productId)).length;
  const isRegular = (productId: string) => hits(productId) >= settings.regularMinHits;

  // ofertas vigentes: só preço simples ou por quantidade mínima viram preço; combos nunca
  const offerByProduct = new Map<string, EnginePromotionItem>();
  const anyPromotionProducts = new Set<string>();
  for (const p of input.activePromotions) {
    anyPromotionProducts.add(p.productId);
    if (p.priceType !== "unit_price" && p.priceType !== "min_qty") continue;
    const cur = offerByProduct.get(p.productId);
    if (!cur || p.priceCents < cur.priceCents) offerByProduct.set(p.productId, p);
  }

  const declinedRecently = new Set(
    input.declines
      .filter((d) => daysBetween(input.now, d.date) < settings.declineCooldownDays)
      .map((d) => d.productId),
  );

  // cobertura: o cliente ainda tem estoque do que comprou?
  function coverage(productId: string): { daysSince: number; coverageDays: number } | null {
    const buys = purchases.get(productId);
    if (!buys?.length) return null;
    const last = buys[0]!;
    const daysSince = Math.max(0, daysBetween(ref, last.date));
    const product = input.products[productId];
    const ingredients = ingredientsByProduct.get(productId) ?? new Set<string>();
    let perDay = 0;
    for (const cr of customerRecipes) {
      if (cr.portionsPerDay === null) continue;
      for (const item of recipesById.get(cr.recipeId)!.items) {
        if (ingredients.has(item.ingredientId) && item.unit === product?.packUnit)
          perDay += item.qtyPerPortion * cr.portionsPerDay;
      }
    }
    let coverageDays = settings.defaultCoverageDays;
    if (perDay > 0 && product?.packTotal) coverageDays = (last.qty * product.packTotal) / perDay;
    else if (buys.length >= 3) {
      const gaps: number[] = [];
      for (let i = 0; i < buys.length - 1; i++)
        gaps.push(daysBetween(buys[i]!.date, buys[i + 1]!.date));
      coverageDays = median(gaps);
    }
    return { daysSince, coverageDays };
  }
  const stillCovered = (productId: string) => {
    const c = coverage(productId);
    return !!c && c.daysSince < c.coverageDays * settings.coverageFactor;
  };
  const lastPurchaseReason = (productId: string): Reason[] => {
    const c = coverage(productId);
    return c ? [{ type: "last_purchase", daysAgo: c.daysSince, coverageDays: c.coverageDays }] : [];
  };

  const priceFor = (productId: string) => {
    const offer = offerByProduct.get(productId);
    if (offer)
      return {
        priceCents: offer.priceCents,
        priceUnit: offer.priceUnit as string | null,
        priceSource: "promotion" as const,
        minQty: offer.minQty,
        promotionItemId: offer.promotionItemId as string | null,
      };
    const p = input.products[productId];
    if (p?.listPriceCents != null)
      return {
        priceCents: p.listPriceCents,
        priceUnit: p.saleUnit,
        priceSource: "list" as const,
        minQty: null,
        promotionItemId: null,
      };
    return {
      priceCents: null,
      priceUnit: null,
      priceSource: null,
      minQty: null,
      promotionItemId: null,
    };
  };
  const promotionReason = (productId: string): Reason[] => {
    const o = offerByProduct.get(productId);
    return o
      ? [
          {
            type: "promotion",
            endsOn: o.endsOn,
            priceCents: o.priceCents,
            regularPriceCents: o.regularPriceCents,
          },
        ]
      : [];
  };

  // --- passo 1: receitas ativadas pela âncora ----------------------------------------------
  const activated: { recipeId: string; anchorProductId: string }[] = [];
  if (customerRecipes.length === 0) warnings.push("no_recipes");
  for (const cr of customerRecipes) {
    const recipe = recipesById.get(cr.recipeId)!;
    const marked = recipe.items.filter((i) => i.isAnchor);
    const anchors = marked.length
      ? marked
      : recipe.items.filter((i) => !input.ingredients[i.ingredientId]?.isCommodity);
    let anchorProductId: string | null = null;
    for (const a of anchors) {
      const mapped = productsByIngredient.get(a.ingredientId) ?? [];
      const inOrder = mapped.find((m) => orderProducts.has(m.productId));
      if (inOrder) {
        anchorProductId = inOrder.productId;
        break;
      }
    }
    if (anchorProductId) activated.push({ recipeId: recipe.id, anchorProductId });
  }
  if (customerRecipes.length > 0 && activated.length === 0) warnings.push("no_anchor");

  // --- passo 2: candidatos da lista A --------------------------------------------------------
  type Cand = { recipeIds: Set<string>; essential: boolean };
  const aCands = new Map<string, Cand>();
  for (const act of activated) {
    const recipe = recipesById.get(act.recipeId)!;
    for (const item of recipe.items) {
      const mapped = productsByIngredient.get(item.ingredientId) ?? [];
      if (mapped.some((m) => orderProducts.has(m.productId))) continue; // ingrediente já no pedido
      if (mapped.length === 0) {
        pendencies.push({
          type: "unmapped_ingredient",
          ingredientId: item.ingredientId,
          recipeId: recipe.id,
        });
        continue;
      }
      const sellable = mapped.filter((m) => input.products[m.productId]?.sellable);
      if (sellable.length === 0) continue;
      const bought = sellable
        .filter((m) => purchases.has(m.productId))
        .sort(
          (a, b) =>
            purchases.get(b.productId)![0]!.date.getTime() -
            purchases.get(a.productId)![0]!.date.getTime(),
        );
      const chosen = (bought[0] ?? sellable[0]!).productId;
      const cand = aCands.get(chosen) ?? { recipeIds: new Set<string>(), essential: false };
      cand.recipeIds.add(recipe.id);
      cand.essential ||= item.isEssential;
      aCands.set(chosen, cand);
    }
  }
  if (pendencies.length > 0) warnings.push("unmapped_ingredients");

  // --- passo 3: filtros -----------------------------------------------------------------------
  const passes = (productId: string) => {
    if (stillCovered(productId)) return false;
    if (declinedRecently.has(productId)) return false;
    // item regular sem oferta vigente vira lembrete, nunca sugestão
    if (isRegular(productId) && !anyPromotionProducts.has(productId)) return false;
    return true;
  };

  type Scored = EngineItem;
  const listA: Scored[] = [];
  for (const [productId, cand] of aCands) {
    if (!passes(productId)) continue;
    const recipeIds = [...cand.recipeIds];
    const hasOffer = offerByProduct.has(productId);
    const price = priceFor(productId);
    const reasons: Reason[] = [
      ...recipeIds.map((rid): Reason => {
        const act = activated.find((a) => a.recipeId === rid)!;
        return { type: "anchor", anchorProductId: act.anchorProductId, recipeId: rid };
      }),
      { type: "completes_recipes", recipeIds },
      ...lastPurchaseReason(productId),
      ...promotionReason(productId),
    ];
    listA.push({
      list: "A",
      productId,
      recipeIds,
      ...price,
      score: 3 * recipeIds.length + (cand.essential ? 1 : 0) + (hasOffer ? 2 : 0),
      reasons,
    });
  }

  // --- passo 4: lista B ------------------------------------------------------------------------
  const boughtCategories = new Set<string>();
  const boughtBrands = new Set<string>();
  for (const [productId, buys] of purchases) {
    if (!buys.some((b) => daysBetween(ref, b.date) <= CATEGORY_WINDOW_DAYS)) continue;
    const p = input.products[productId];
    if (p?.category) boughtCategories.add(p.category);
    if (p?.brand) boughtBrands.add(p.brand);
  }
  const inA = new Set(listA.map((i) => i.productId));
  const listB: Scored[] = [];
  for (const [productId, offer] of offerByProduct) {
    if (orderProducts.has(productId) || inA.has(productId)) continue;
    // um produto de A que caiu nos filtros não volta pela lista B
    if (aCands.has(productId)) continue;
    const product = input.products[productId];
    if (!product?.sellable) continue;
    const ingredients = ingredientsByProduct.get(productId) ?? new Set<string>();
    const related = customerRecipes
      .filter((cr) =>
        recipesById.get(cr.recipeId)!.items.some((i) => ingredients.has(i.ingredientId)),
      )
      .map((cr) => cr.recipeId);
    const categoryHit = !!product.category && boughtCategories.has(product.category);
    let eligible: boolean;
    if (customerRecipes.length > 0) eligible = related.length > 0;
    else if (product.category) eligible = categoryHit;
    else eligible = !!product.brand && boughtBrands.has(product.brand);
    if (!eligible) continue;
    if (stillCovered(productId) || declinedRecently.has(productId)) continue;
    const saving =
      offer.regularPriceCents && offer.regularPriceCents > offer.priceCents
        ? (offer.regularPriceCents - offer.priceCents) / offer.regularPriceCents
        : 0;
    listB.push({
      list: "B",
      productId,
      recipeIds: related,
      ...priceFor(productId),
      score: 2 * related.length + saving + (categoryHit ? 1 : 0),
      reasons: [
        ...(related.length ? [{ type: "completes_recipes", recipeIds: related } as Reason] : []),
        ...lastPurchaseReason(productId),
        ...promotionReason(productId),
      ],
    });
  }

  // --- passo 5: ordenação e corte ----------------------------------------------------------------
  const merged = [...listA, ...listB].sort(
    (a, b) =>
      b.score - a.score ||
      (a.list === b.list ? 0 : a.list === "A" ? -1 : 1) ||
      a.productId.localeCompare(b.productId),
  );
  const picked: EngineItem[] = [];
  let bCount = 0;
  for (const c of merged) {
    if (picked.length >= settings.maxSuggestions) break;
    if (c.list === "B" && bCount >= settings.maxListB) continue;
    if (c.list === "B") bCount += 1;
    picked.push(c);
  }

  // --- lembretes: itens regulares fora do pedido, sem oferta ---------------------------------------
  const reminders: EngineItem[] = [];
  for (const productId of purchases.keys()) {
    if (orderProducts.has(productId) || !isRegular(productId)) continue;
    if (anyPromotionProducts.has(productId) || declinedRecently.has(productId)) continue;
    if (stillCovered(productId)) continue;
    reminders.push({
      list: "reminder",
      productId,
      recipeIds: [],
      promotionItemId: null,
      priceCents: null,
      priceUnit: null,
      priceSource: null,
      minQty: null,
      score: hits(productId),
      reasons: [{ type: "regular_item_missing" }, ...lastPurchaseReason(productId)],
    });
  }
  reminders.sort((a, b) => b.score - a.score || a.productId.localeCompare(b.productId));

  return {
    engineVersion: ENGINE_VERSION,
    items: [...picked, ...reminders.slice(0, MAX_REMINDERS)],
    warnings,
    pendencies,
  };
}
