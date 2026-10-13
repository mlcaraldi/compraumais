import type { Db } from "../db/client";
import { buildProductSearchText } from "../importers/spreadsheet/products";
import { addDaysIso, todayIso } from "../normalize";
import {
  customersRepo,
  ordersRepo,
  productsRepo,
  promotionsRepo,
  recipesRepo,
  segmentsRepo,
} from "../repos";
import { runSuggestionsForOrder } from "../services/suggestions";

export const DEMO_CUSTOMER_CODE = "DEMO-1";
export const DEMO_ORDER_NUMBER = "DEMO-0001";
/** Receitas usadas no pedido da demo; o pedido leva só o ingrediente âncora de cada uma. */
export const DEMO_RECIPES = ["Sanduíche Australiano Defumado", "Capuccino dos Deuses"];
/** Ingredientes que o cliente fictício nunca comprou: viram sugestões novas. */
const NEVER_BOUGHT = [/molho grill/i, /presunto/i];
const COMMODITY = [/alface/i, /tomate/i, /raspas/i, /queijo/i];
const ANCHOR = [/nescaf/i, /waffle/i, /^p[aã]o/i];
const MIX_RECIPES_PER_DAY = "12";
const DAY_MS = 86_400_000;

export type DemoResult = { customerId: string; orderId: string; products: number };

/**
 * Monta o mundo da demo (seção 1 do plano) sobre receitas já importadas: um cliente de cafeteria
 * fictício com as receitas associadas, produtos sintéticos vinculados aos ingredientes, 8 semanas
 * de histórico, duas ofertas vigentes e um pedido de hoje. Tudo sintético e identificado como demo.
 */
export async function seedDemoWorld(
  db: Db,
  tenantId: string,
  now: Date = new Date(),
): Promise<DemoResult> {
  const recipeRows = await recipesRepo.listRecipes(db, tenantId);
  if (recipeRows.length === 0) throw new Error("Importe as receitas antes de montar a demo");

  // 1. cliente fictício de cafeteria
  const segment = (await segmentsRepo.listSegments(db, tenantId)).find(
    (s) => s.code === "bar_cafeteria",
  );
  await customersRepo.upsertCustomers(db, tenantId, [
    {
      externalCode: DEMO_CUSTOMER_CODE,
      legalName: "CAFE DEMO LTDA",
      tradeName: "CAFE CULTURA DEMO",
      contactName: "Marina",
      phoneRaw: "(54) 99999-0000",
      phoneE164: "+5554999990000",
      phoneKind: "mobile",
      segmentRaw: "BAR/CAFETERIA",
      segmentId: segment?.id ?? null,
      city: "PASSO FUNDO",
      state: "RS",
    },
  ]);
  const customer = (await customersRepo.listCustomers(db, tenantId, { q: DEMO_CUSTOMER_CODE }))
    .rows[0]!;
  const customerId = customer.id;

  // 2. receitas do cliente, âncoras, commodities, produtos sintéticos e vínculos aprovados
  const productByIngredient = new Map<string, { id: string; priceCents: number }>();
  const recipeIngredients = new Map<string, string[]>();
  let n = 0;
  for (const { recipe } of recipeRows) {
    await recipesRepo.addCustomerRecipe(db, tenantId, {
      customerId,
      recipeId: recipe.id,
      source: "user",
      portionsPerDay: MIX_RECIPES_PER_DAY,
    });
    const items = await recipesRepo.listRecipeItems(db, tenantId, recipe.id);
    const marked = items.filter((i) => ANCHOR.some((rx) => rx.test(i.ingredient.name)));
    // uma âncora por receita: o primeiro ingrediente que parece o item principal
    const anchor = marked[0] ?? items[0];
    for (const { item, ingredient } of items) {
      await recipesRepo.updateRecipeItem(db, tenantId, item.id, {
        isAnchor: item === anchor?.item,
      });
      if (COMMODITY.some((rx) => rx.test(ingredient.name)))
        await recipesRepo.setIngredientCommodity(db, tenantId, ingredient.id, true);
      if (!productByIngredient.has(ingredient.id)) {
        const priceCents = item.packPriceHintCents ?? 2500;
        const code = `DEMO-${String(++n).padStart(3, "0")}`;
        await productsRepo.upsertProducts(db, tenantId, [
          {
            code,
            description: ingredient.name.toUpperCase(),
            saleUnit: "un",
            listPriceCents: priceCents,
            source: "manual",
            searchText: buildProductSearchText({
              code,
              description: ingredient.name.toUpperCase(),
              brand: null,
            }),
          },
        ]);
        const id = (await productsRepo.findProductIdsByCodes(db, tenantId, [code])).get(code)!;
        productByIngredient.set(ingredient.id, { id, priceCents });
        await recipesRepo.upsertIngredientLink(db, tenantId, {
          ingredientId: ingredient.id,
          productId: id,
          status: "approved",
          suggestedBy: "user",
        });
      }
    }
    recipeIngredients.set(
      recipe.id,
      items.map((i) => i.ingredient.id),
    );
  }

  // 3. histórico: 8 pedidos semanais com os ingredientes das receitas da demo, menos os "nunca comprados"
  const demo = recipeRows.filter((r) => DEMO_RECIPES.includes(r.recipe.name));
  if (demo.length === 0) throw new Error(`A demo precisa das receitas: ${DEMO_RECIPES.join(", ")}`);
  const named = new Map<
    string,
    { id: string; priceCents: number; name: string; anchor: boolean }
  >();
  for (const { recipe } of demo)
    for (const { item, ingredient } of await recipesRepo.listRecipeItems(db, tenantId, recipe.id)) {
      const p = productByIngredient.get(ingredient.id)!;
      const anchor = (await recipesRepo.getRecipeItem(db, tenantId, item.id))?.isAnchor ?? false;
      named.set(ingredient.id, { ...p, name: ingredient.name, anchor });
    }
  const staples = [...named.values()].filter((p) => !NEVER_BOUGHT.some((rx) => rx.test(p.name)));
  for (let w = 8; w >= 1; w--) {
    const issuedAt = new Date(now.getTime() - w * 7 * DAY_MS);
    await ordersRepo.createOrderWithLines(
      db,
      tenantId,
      {
        externalNumber: `DEMO-H${String(9 - w).padStart(2, "0")}`,
        customerId,
        issuedAt,
        status: "confirmed",
        paymentTerms: "28 dias",
      },
      staples.map((p) => ({
        productId: p.id,
        rawDescription: p.name.toUpperCase(),
        unit: "UN",
        qty: "2",
        unitPriceCents: p.priceCents,
        totalCents: p.priceCents * 2,
      })),
    );
  }

  // 4. duas ofertas vigentes: o molho grill (nunca comprado) e o chantilly (regular, já acabou)
  const today = todayIso(now);
  const offerFor = (rx: RegExp) => [...named.values()].find((p) => rx.test(p.name));
  const molho = offerFor(/molho grill/i);
  const chantilly = offerFor(/chantilly/i);
  const offerItems = [molho, chantilly]
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({
      productId: p.id,
      rawCode: null,
      rawDescription: p.name.toUpperCase(),
      priceCents: Math.round(p.priceCents * 0.85),
      priceUnit: "un",
      regularPriceCents: p.priceCents,
      priceType: "unit_price",
    }));
  if (offerItems.length)
    await promotionsRepo.createPromotionWithItems(
      db,
      tenantId,
      {
        name: "Ofertas da semana (demo)",
        supplierBrand: "Demo",
        startsOn: addDaysIso(today, -1),
        endsOn: addDaysIso(today, 6),
        status: "active",
      },
      offerItems,
    );

  // 5. pedido de hoje: só o ingrediente âncora de cada receita da demo
  const anchors = [...named.values()].filter((p) => p.anchor);
  const order = await ordersRepo.createOrderWithLines(
    db,
    tenantId,
    {
      externalNumber: DEMO_ORDER_NUMBER,
      customerId,
      issuedAt: now,
      status: "confirmed",
      paymentTerms: "28 dias",
      totalCents: anchors.reduce((s, p) => s + p.priceCents * 4, 0),
    },
    anchors.map((p) => ({
      productId: p.id,
      rawDescription: p.name.toUpperCase(),
      unit: "UN",
      qty: "4",
      unitPriceCents: p.priceCents,
      totalCents: p.priceCents * 4,
    })),
  );
  await runSuggestionsForOrder(db, tenantId, order.id, now);
  return { customerId, orderId: order.id, products: productByIngredient.size };
}
