import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_SETTINGS } from "@/server/engine/settings";
import { runEngine } from "@/server/engine/engine";
import { buildMessage, whatsappLink } from "@/server/engine/message";
import type {
  EngineInput,
  EngineProduct,
  EnginePromotionItem,
  EngineRecipe,
} from "@/server/engine/types";
import { parseRecipesCsv } from "@/server/importers/spreadsheet/recipes";
import { readTable } from "@/server/importers/spreadsheet/table";
import { ingredientKey } from "@/server/normalize";

const NOW = new Date("2026-10-07T15:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const product = (id: string, over: Partial<EngineProduct> = {}): EngineProduct => ({
  id,
  description: id.toUpperCase(),
  brand: null,
  sellable: true,
  packTotal: null,
  packUnit: null,
  saleUnit: "un",
  listPriceCents: 1000,
  category: null,
  ...over,
});

const PRODUCTS: Record<string, EngineProduct> = Object.fromEntries(
  [
    product("p-pao", { description: "PAO AUSTRALIANO FAZ E FORNO 5 UN" }),
    product("p-molho", { description: "MOLHO GRILL ZAFRAN 1,01KG", listPriceCents: 4025 }),
    product("p-presunto"),
    product("p-queijo", { description: "QUEIJO MUSSARELA FATIADO" }),
    product("p-alface"),
    product("p-chantilly", {
      description: "CHANTILLY CHEF E CO 1KG",
      packTotal: 1000,
      packUnit: "g",
    }),
    product("p-nescafe"),
    product("p-vagem", { description: "VG VAGEM 2KG CG CONFRESCOR" }),
    product("p-grao", { description: "VG GRAO DE BICO 1KG CG GRANO" }),
    product("p-amido", { description: "AMIDO DE MILHO PCT 5KG NUANCE" }),
    product("p-sem-preco", { listPriceCents: null }),
  ].map((p) => [p.id, p]),
);

const R_AUS: EngineRecipe = {
  id: "r-aus",
  name: "Sanduíche Australiano Defumado",
  items: [
    { ingredientId: "i-pao", qtyPerPortion: 75, unit: "g", isAnchor: true, isEssential: false },
    { ingredientId: "i-molho", qtyPerPortion: 20, unit: "g", isAnchor: false, isEssential: true },
    {
      ingredientId: "i-presunto",
      qtyPerPortion: 40,
      unit: "g",
      isAnchor: false,
      isEssential: false,
    },
    { ingredientId: "i-queijo", qtyPerPortion: 20, unit: "g", isAnchor: false, isEssential: false },
    { ingredientId: "i-alface", qtyPerPortion: 5, unit: "g", isAnchor: false, isEssential: false },
  ],
};
const R_CAP: EngineRecipe = {
  id: "r-cap",
  name: "Capuccino dos Deuses",
  items: [
    { ingredientId: "i-nescafe", qtyPerPortion: 1, unit: "un", isAnchor: true, isEssential: false },
    {
      ingredientId: "i-chantilly",
      qtyPerPortion: 25,
      unit: "g",
      isAnchor: false,
      isEssential: true,
    },
  ],
};
const LINKS = [
  ["i-pao", "p-pao"],
  ["i-molho", "p-molho"],
  ["i-presunto", "p-presunto"],
  ["i-queijo", "p-queijo"],
  ["i-alface", "p-alface"],
  ["i-nescafe", "p-nescafe"],
  ["i-chantilly", "p-chantilly"],
].map(([ingredientId, productId]) => ({
  ingredientId: ingredientId!,
  productId: productId!,
  priority: 1,
}));

function base(over: Partial<EngineInput> = {}): EngineInput {
  return {
    now: NOW,
    order: { id: "o1", issuedAt: NOW, lines: [{ productId: "p-pao", qty: 2 }] },
    customer: { id: "c1", blocked: false, segmentCode: "bar_cafeteria", phoneKind: "mobile" },
    customerRecipes: [
      { recipeId: "r-aus", portionsPerDay: null },
      { recipeId: "r-cap", portionsPerDay: null },
    ],
    recipes: [R_AUS, R_CAP],
    ingredients: {},
    ingredientProducts: LINKS,
    products: PRODUCTS,
    history: [],
    activePromotions: [],
    declines: [],
    settings: DEFAULT_ENGINE_SETTINGS,
    ...over,
  };
}

const offer = (
  productId: string,
  over: Partial<EnginePromotionItem> = {},
): EnginePromotionItem => ({
  promotionItemId: `pi-${productId}`,
  productId,
  priceCents: 3500,
  priceUnit: "un",
  priceType: "unit_price",
  minQty: null,
  endsOn: "2026-10-12",
  regularPriceCents: null,
  ...over,
});

/** Histórico em que `productId` aparece nos pedidos de índice `inOrders` (0 = mais recente). */
function regularHistory(productId: string, inOrders: number[], total = 6) {
  const rows: EngineInput["history"] = [];
  for (let i = 0; i < total; i++) {
    const date = daysAgo(40 + 7 * i);
    rows.push({ productId: "p-alface", qty: 1, date, orderId: `h${i}` });
    if (inOrders.includes(i)) rows.push({ productId, qty: 1, date, orderId: `h${i}` });
  }
  return rows;
}

const listOf = (out: ReturnType<typeof runEngine>, list: "A" | "B" | "reminder") =>
  out.items.filter((i) => i.list === list);

describe("motor: lista A e âncora", () => {
  it("1. pedido sem ingrediente âncora das receitas: lista A vazia e aviso no_anchor", () => {
    const out = runEngine(
      base({
        order: {
          id: "o2707401471",
          issuedAt: NOW,
          lines: [
            { productId: "p-vagem", qty: 2 },
            { productId: "p-grao", qty: 2 },
            { productId: "p-amido", qty: 1 },
          ],
        },
      }),
    );
    expect(listOf(out, "A")).toEqual([]);
    expect(out.warnings).toContain("no_anchor");
  });

  const csv = "data/real/receitas_normalizadas.csv";
  it.skipIf(!existsSync(csv))("1b. o mesmo pedido contra as 9 receitas reais da cafeteria", () => {
    const parsed = parseRecipesCsv(readTable(readFileSync(csv), "x.csv"));
    expect(parsed).toHaveLength(9);
    const products: Record<string, EngineProduct> = { ...PRODUCTS };
    const links: EngineInput["ingredientProducts"] = [];
    const recipes: EngineRecipe[] = parsed.map((r, n) => ({
      id: `real-${n}`,
      name: r.name,
      items: r.items.map((i) => {
        const key = ingredientKey(i.ingredientName);
        products[`ing-${key}`] ??= product(`ing-${key}`);
        links.push({ ingredientId: key, productId: `ing-${key}`, priority: 1 });
        return {
          ingredientId: key,
          qtyPerPortion: i.qtyPerPortion,
          unit: i.unit,
          isAnchor: false,
          isEssential: false,
        };
      }),
    }));
    const out = runEngine(
      base({
        recipes,
        customerRecipes: recipes.map((r) => ({ recipeId: r.id, portionsPerDay: null })),
        ingredientProducts: links,
        products,
        order: {
          id: "o2707401471",
          issuedAt: NOW,
          lines: [
            { productId: "p-vagem", qty: 2 },
            { productId: "p-grao", qty: 2 },
            { productId: "p-amido", qty: 1 },
          ],
        },
      }),
    );
    expect(listOf(out, "A")).toEqual([]);
    expect(out.warnings).toContain("no_anchor");
  });

  it("2. pão australiano sem molho grill: o molho entra na lista A apontando o pão", () => {
    const out = runEngine(base());
    const molho = listOf(out, "A").find((i) => i.productId === "p-molho")!;
    expect(molho).toBeTruthy();
    expect(molho.reasons).toContainEqual({
      type: "anchor",
      anchorProductId: "p-pao",
      recipeId: "r-aus",
    });
    expect(molho.priceSource).toBe("list");
    expect(molho.priceCents).toBe(4025);
  });

  it("usa como âncora os ingredientes não commodity quando a receita não marca âncora", () => {
    const noAnchors: EngineRecipe = {
      ...R_AUS,
      items: R_AUS.items.map((i) => ({ ...i, isAnchor: false })),
    };
    const out = runEngine(
      base({
        recipes: [noAnchors, R_CAP],
        // só o queijo e a alface são commodities; o pão passa a ser âncora implícita
        ingredients: {
          "i-queijo": { isCommodity: true },
          "i-alface": { isCommodity: true },
          "i-presunto": { isCommodity: true },
          "i-molho": { isCommodity: true },
        },
        order: { id: "o", issuedAt: NOW, lines: [{ productId: "p-queijo", qty: 1 }] },
      }),
    );
    expect(listOf(out, "A")).toEqual([]);
    expect(out.warnings).toContain("no_anchor");
    const out2 = runEngine(
      base({
        recipes: [noAnchors, R_CAP],
        ingredients: { "i-queijo": { isCommodity: true } },
        order: { id: "o", issuedAt: NOW, lines: [{ productId: "p-pao", qty: 1 }] },
      }),
    );
    expect(listOf(out2, "A").length).toBeGreaterThan(0);
  });

  it("ingrediente sem produto vinculado vira pendência e aviso, sem sugestão", () => {
    const out = runEngine(
      base({ ingredientProducts: LINKS.filter((l) => l.ingredientId !== "i-molho") }),
    );
    expect(listOf(out, "A").find((i) => i.productId === "p-molho")).toBeUndefined();
    expect(out.pendencies).toContainEqual({
      type: "unmapped_ingredient",
      ingredientId: "i-molho",
      recipeId: "r-aus",
    });
    expect(out.warnings).toContain("unmapped_ingredients");
  });

  it("não sugere produto que não é vendável", () => {
    const out = runEngine(
      base({ products: { ...PRODUCTS, "p-molho": product("p-molho", { sellable: false }) } }),
    );
    expect(out.items.find((i) => i.productId === "p-molho")).toBeUndefined();
  });

  it("prefere o produto que o cliente já comprou ao de menor prioridade", () => {
    const products = { ...PRODUCTS, "p-molho2": product("p-molho2") };
    const out = runEngine(
      base({
        products,
        ingredientProducts: [
          ...LINKS,
          { ingredientId: "i-molho", productId: "p-molho2", priority: 2 },
        ],
        history: [{ productId: "p-molho2", qty: 1, date: daysAgo(60), orderId: "h0" }],
      }),
    );
    expect(listOf(out, "A").some((i) => i.productId === "p-molho2")).toBe(true);
    expect(listOf(out, "A").some((i) => i.productId === "p-molho")).toBe(false);
  });
});

describe("motor: filtros", () => {
  const capOrder = { id: "o", issuedAt: NOW, lines: [{ productId: "p-nescafe", qty: 1 }] };

  it("3. chantilly comprado há 2 dias (cobertura de 4 dias) não é sugerido", () => {
    const input = base({
      order: capOrder,
      customerRecipes: [{ recipeId: "r-cap", portionsPerDay: 10 }],
      history: [{ productId: "p-chantilly", qty: 1, date: daysAgo(2), orderId: "h0" }],
    });
    expect(runEngine(input).items.find((i) => i.productId === "p-chantilly")).toBeUndefined();
    // passado o prazo de cobertura (4 dias × 0,8 = 3,2), volta a ser sugerido
    const later = runEngine({
      ...input,
      history: [{ productId: "p-chantilly", qty: 1, date: daysAgo(5), orderId: "h0" }],
    });
    const item = listOf(later, "A").find((i) => i.productId === "p-chantilly")!;
    expect(item.reasons).toContainEqual({ type: "last_purchase", daysAgo: 5, coverageDays: 4 });
  });

  it("sem porções por dia usa a mediana dos intervalos quando há 3 compras ou mais", () => {
    const input = base({
      order: capOrder,
      history: [
        { productId: "p-chantilly", qty: 1, date: daysAgo(10), orderId: "h0" },
        { productId: "p-chantilly", qty: 1, date: daysAgo(30), orderId: "h1" },
        { productId: "p-chantilly", qty: 1, date: daysAgo(50), orderId: "h2" },
      ],
    });
    // intervalos de 20 dias: 10 dias desde a última compra < 20 × 0,8
    expect(runEngine(input).items.find((i) => i.productId === "p-chantilly")).toBeUndefined();
  });

  it("sem dados usa 14 dias de cobertura padrão", () => {
    const base2 = base({
      order: capOrder,
      history: [{ productId: "p-chantilly", qty: 1, date: daysAgo(10), orderId: "h0" }],
    });
    expect(runEngine(base2).items.find((i) => i.productId === "p-chantilly")).toBeUndefined(); // 10 < 11,2
    const out = runEngine({
      ...base2,
      history: [{ productId: "p-chantilly", qty: 1, date: daysAgo(12), orderId: "h0" }],
    });
    expect(listOf(out, "A").some((i) => i.productId === "p-chantilly")).toBe(true);
  });

  it("4. item regular ausente e sem oferta vai para lembrete, não para A nem B", () => {
    const out = runEngine(base({ history: regularHistory("p-queijo", [0, 2, 4]) }));
    expect(out.items.find((i) => i.productId === "p-queijo")).toMatchObject({
      list: "reminder",
      priceCents: null,
    });
    expect(listOf(out, "A").some((i) => i.productId === "p-queijo")).toBe(false);
    expect(listOf(out, "B").some((i) => i.productId === "p-queijo")).toBe(false);
  });

  it("2 compras em 6 pedidos não é regular: continua sugestão normal", () => {
    const out = runEngine(base({ history: regularHistory("p-queijo", [0, 3]) }));
    expect(listOf(out, "A").some((i) => i.productId === "p-queijo")).toBe(true);
    expect(listOf(out, "reminder").some((i) => i.productId === "p-queijo")).toBe(false);
  });

  it("5. o mesmo item regular com oferta vigente aparece na lista B com o preço da oferta", () => {
    const out = runEngine(
      base({
        order: { id: "o", issuedAt: NOW, lines: [{ productId: "p-vagem", qty: 1 }] },
        history: regularHistory("p-queijo", [0, 2, 4]),
        activePromotions: [offer("p-queijo", { priceCents: 3290, regularPriceCents: 4390 })],
      }),
    );
    const item = listOf(out, "B").find((i) => i.productId === "p-queijo")!;
    expect(item).toMatchObject({
      priceCents: 3290,
      priceSource: "promotion",
      promotionItemId: "pi-p-queijo",
    });
    expect(item.reasons).toContainEqual({
      type: "promotion",
      endsOn: "2026-10-12",
      priceCents: 3290,
      regularPriceCents: 4390,
    });
    expect(listOf(out, "reminder").some((i) => i.productId === "p-queijo")).toBe(false);
  });

  it("6. oferta de chantilly, cliente de cafeteria sem âncora no pedido: lista B sugere", () => {
    const out = runEngine(
      base({
        order: { id: "o", issuedAt: NOW, lines: [{ productId: "p-vagem", qty: 1 }] },
        history: [{ productId: "p-chantilly", qty: 1, date: daysAgo(30), orderId: "h0" }],
        activePromotions: [offer("p-chantilly", { priceCents: 6990 })],
      }),
    );
    expect(listOf(out, "A")).toEqual([]);
    expect(listOf(out, "B").map((i) => i.productId)).toEqual(["p-chantilly"]);
    expect(out.warnings).toContain("no_anchor");
  });

  it("recusa recente tira o produto; depois do prazo ele volta", () => {
    const declined = base({ declines: [{ productId: "p-molho", date: daysAgo(10) }] });
    expect(runEngine(declined).items.find((i) => i.productId === "p-molho")).toBeUndefined();
    const old = base({ declines: [{ productId: "p-molho", date: daysAgo(45) }] });
    expect(runEngine(old).items.some((i) => i.productId === "p-molho")).toBe(true);
  });

  it("combo e ofertas de outro tipo não viram preço nem entram na lista B", () => {
    const out = runEngine(
      base({
        order: { id: "o", issuedAt: NOW, lines: [{ productId: "p-vagem", qty: 1 }] },
        activePromotions: [offer("p-chantilly", { priceType: "bundle", priceCents: 1939 })],
      }),
    );
    expect(out.items).toEqual([]);
  });

  it("sem receitas, a lista B usa a categoria comprada nos últimos 90 dias (ou a marca)", () => {
    const products = {
      ...PRODUCTS,
      "p-cat": product("p-cat", { category: "Congelados" }),
      "p-comprado": product("p-comprado", { category: "Congelados" }),
      "p-outra": product("p-outra", { category: "Bebidas" }),
      "p-marca": product("p-marca", { brand: "Vigor", category: null }),
      "p-marca-comprada": product("p-marca-comprada", { brand: "Vigor", category: null }),
    };
    const out = runEngine(
      base({
        customerRecipes: [],
        order: { id: "o", issuedAt: NOW, lines: [{ productId: "p-vagem", qty: 1 }] },
        products,
        history: [
          { productId: "p-comprado", qty: 1, date: daysAgo(30), orderId: "h0" },
          { productId: "p-marca-comprada", qty: 1, date: daysAgo(30), orderId: "h0" },
        ],
        activePromotions: [offer("p-cat"), offer("p-outra"), offer("p-marca")],
      }),
    );
    expect(
      listOf(out, "B")
        .map((i) => i.productId)
        .sort(),
    ).toEqual(["p-cat", "p-marca"]);
    expect(out.warnings).toContain("no_recipes");
  });
});

describe("motor: preço, limites e avisos", () => {
  it("7. produto sem oferta nem preço de lista fica com preço nulo", () => {
    const out = runEngine(
      base({
        recipes: [
          {
            ...R_AUS,
            items: [
              R_AUS.items[0]!,
              {
                ingredientId: "i-x",
                qtyPerPortion: 1,
                unit: "un",
                isAnchor: false,
                isEssential: false,
              },
            ],
          },
          R_CAP,
        ],
        ingredientProducts: [
          ...LINKS,
          { ingredientId: "i-x", productId: "p-sem-preco", priority: 1 },
        ],
      }),
    );
    const item = out.items.find((i) => i.productId === "p-sem-preco")!;
    expect(item).toMatchObject({ priceCents: null, priceUnit: null, priceSource: null });
  });

  it("8. no máximo 3 itens, no máximo 2 da lista B e nenhum produto em duas listas", () => {
    const many: Record<string, EngineProduct> = { ...PRODUCTS };
    const promos: EnginePromotionItem[] = [];
    const items: EngineRecipe["items"] = [];
    const links = [...LINKS];
    for (let i = 0; i < 6; i++) {
      many[`p-b${i}`] = product(`p-b${i}`);
      items.push({
        ingredientId: `i-b${i}`,
        qtyPerPortion: 1,
        unit: "un",
        isAnchor: false,
        isEssential: false,
      });
      links.push({ ingredientId: `i-b${i}`, productId: `p-b${i}`, priority: 1 });
      promos.push(offer(`p-b${i}`, { priceCents: 500 + i }));
    }
    const rb: EngineRecipe = { id: "r-b", name: "Receita B", items };
    // sem âncora no pedido: tudo vem pela lista B
    const onlyB = runEngine(
      base({
        recipes: [R_AUS, R_CAP, rb],
        customerRecipes: [{ recipeId: "r-b", portionsPerDay: null }],
        order: { id: "o", issuedAt: NOW, lines: [{ productId: "p-vagem", qty: 1 }] },
        products: many,
        ingredientProducts: links,
        activePromotions: promos,
      }),
    );
    expect(listOf(onlyB, "B")).toHaveLength(2);
    expect(onlyB.items.filter((i) => i.list !== "reminder").length).toBeLessThanOrEqual(3);
    // com âncora: A e B juntos respeitam os dois limites e não repetem produto
    const mixed = runEngine(
      base({
        recipes: [R_AUS, R_CAP, rb],
        customerRecipes: [
          { recipeId: "r-aus", portionsPerDay: null },
          { recipeId: "r-b", portionsPerDay: null },
        ],
        products: many,
        ingredientProducts: links,
        activePromotions: [...promos, offer("p-molho"), offer("p-presunto")],
      }),
    );
    const shown = mixed.items.filter((i) => i.list !== "reminder");
    expect(shown.length).toBeLessThanOrEqual(3);
    expect(shown.filter((i) => i.list === "B").length).toBeLessThanOrEqual(2);
    expect(new Set(shown.map((i) => i.productId)).size).toBe(shown.length);
  });

  it("9. cliente bloqueado: gera sugestões e avisa", () => {
    const out = runEngine(
      base({ customer: { id: "c1", blocked: true, segmentCode: null, phoneKind: "mobile" } }),
    );
    expect(out.warnings).toContain("customer_blocked");
    expect(listOf(out, "A").length).toBeGreaterThan(0);
  });

  it("telefone fixo ou inválido avisa que não dá WhatsApp", () => {
    for (const phoneKind of ["landline", "invalid"]) {
      const out = runEngine(
        base({ customer: { id: "c1", blocked: false, segmentCode: null, phoneKind } }),
      );
      expect(out.warnings).toContain("no_whatsapp");
    }
  });

  it("é determinístico", () => {
    expect(runEngine(base())).toEqual(runEngine(base()));
  });
});

describe("mensagem de WhatsApp", () => {
  const input = () => {
    const out = runEngine(
      base({
        recipes: [{ ...R_AUS, items: R_AUS.items.slice(0, 2) }, R_CAP],
        customerRecipes: [
          { recipeId: "r-aus", portionsPerDay: null },
          { recipeId: "r-cap", portionsPerDay: null },
        ],
        activePromotions: [
          offer("p-molho", { priceCents: 4025, endsOn: "2026-10-12" }),
          offer("p-chantilly", { priceCents: 6990, endsOn: "2026-10-14" }),
        ],
        history: [{ productId: "p-chantilly", qty: 1, date: daysAgo(40), orderId: "h0" }],
        ingredientProducts: LINKS,
      }),
    );
    return { out, items: out.items };
  };
  const customer = {
    contactName: null,
    tradeName: "RESTAURANTE E CAFE CULTURA",
    legalName: "CULTURA LTDA",
  };

  it("10. mensagem de um item A e um item B", () => {
    const { items } = input();
    expect(items.map((i) => [i.list, i.productId])).toEqual([
      ["A", "p-molho"],
      ["B", "p-chantilly"],
    ]);
    const text = buildMessage({
      customer,
      order: { issuedAt: NOW },
      items,
      products: PRODUCTS,
      recipes: { "r-aus": R_AUS, "r-cap": R_CAP },
      now: NOW,
    });
    expect(text).toMatchInlineSnapshot(`
      "Oi, Restaurante e Cafe Cultura! Recebi seu pedido de hoje.
      Para Sanduíche Australiano Defumado, faltou Molho Grill Zafran 1,01kg: R$ 40,25/un, em oferta até 12/10.
      Chantilly Chef e Co 1kg está em oferta esta semana: R$ 69,90/un até 14/10.
      Se quiser, incluo no mesmo pedido e vai na mesma entrega. É só me responder."
    `);
    expect(text).not.toMatch(/!!|imperdível/i);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    expect((text.match(/!/g) ?? []).length).toBeLessThanOrEqual(1);
  });

  it("usa o nome de contato, nunca a razão social, e a data quando o pedido não é de hoje", () => {
    const { items } = input();
    const text = buildMessage({
      customer: { ...customer, contactName: "Marina" },
      order: { issuedAt: daysAgo(3) },
      items,
      products: PRODUCTS,
      recipes: { "r-aus": R_AUS },
      now: NOW,
    });
    expect(text.split("\n")[0]).toBe("Oi, Marina! Recebi seu pedido do dia 04/10.");
    expect(text).not.toMatch(/CULTURA LTDA/i);
  });

  it("item sem preço vira 'posso te passar o preço'", () => {
    const text = buildMessage({
      customer,
      order: { issuedAt: NOW },
      items: [
        {
          list: "A",
          productId: "p-sem-preco",
          recipeIds: [],
          promotionItemId: null,
          priceCents: null,
          priceUnit: null,
          priceSource: null,
          minQty: null,
          score: 3,
          reasons: [],
        },
      ],
      products: PRODUCTS,
      recipes: {},
      now: NOW,
    });
    expect(text).toContain("P-sem-preco: posso te passar o preço.");
  });

  it("monta o link wa.me e desabilita para telefone fixo", () => {
    expect(whatsappLink("+5554999314042", "mobile", "Oi, tudo bem?")).toBe(
      "https://wa.me/5554999314042?text=Oi%2C%20tudo%20bem%3F",
    );
    expect(whatsappLink("+555436320079", "landline", "x")).toBeNull();
    expect(whatsappLink(null, "mobile", "x")).toBeNull();
  });
});
