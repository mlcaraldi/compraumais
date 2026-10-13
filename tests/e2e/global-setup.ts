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
} from "../../src/server/db/schema";
import { usersRepo } from "../../src/server/repos";
import { runSuggestionsForOrder } from "../../src/server/services/suggestions";
import { closeDb, resetTestDb } from "../helpers/db";

export const E2E_USER = { email: "ricardo@teste.local", password: "senha-de-teste-123" };
export const E2E_ORDER_NUMBER = "E2E-1001";

/** Cafeteria fictícia: pedido com pão australiano; faltam molho (em oferta) e presunto (preço de lista). */
export default async function globalSetup() {
  const { db, tenantId } = await resetTestDb();
  await usersRepo.createUser(db, tenantId, {
    email: E2E_USER.email,
    name: "Ricardo",
    role: "admin",
    password: E2E_USER.password,
  });
  const ids: Record<string, string> = {};
  const prod = async (key: string, description: string, priceCents: number) => {
    const [p] = await db
      .insert(products)
      .values({ tenantId, code: key, description, listPriceCents: priceCents, saleUnit: "un" })
      .returning();
    ids[key] = p!.id;
  };
  await prod("pao", "PAO AUSTRALIANO 5UN", 1500);
  await prod("molho", "MOLHO GRILL ZAFRAN 1,01KG", 4025);
  await prod("presunto", "PRESUNTO COZIDO FATIADO 1KG", 3290);

  const [customer] = await db
    .insert(customers)
    .values({
      tenantId,
      externalCode: "9001",
      legalName: "CAFE CULTURA LTDA",
      tradeName: "CAFE CULTURA",
      phoneE164: "+5554999314042",
      phoneKind: "mobile",
    })
    .returning();
  const [recipe] = await db
    .insert(recipes)
    .values({ tenantId, name: "Sanduíche Australiano" })
    .returning();
  for (const [key, name, anchor] of [
    ["pao", "pao australiano", true],
    ["molho", "molho grill", false],
    ["presunto", "presunto", false],
  ] as const) {
    const [ing] = await db
      .insert(ingredients)
      .values({ tenantId, name, normalizedName: name })
      .returning();
    await db.insert(recipeItems).values({
      tenantId,
      recipeId: recipe!.id,
      ingredientId: ing!.id,
      qtyPerPortion: "10",
      unit: "g",
      isAnchor: anchor,
    });
    await db
      .insert(ingredientProducts)
      .values({ tenantId, ingredientId: ing!.id, productId: ids[key]!, status: "approved" });
  }
  await db
    .insert(customerRecipes)
    .values({ tenantId, customerId: customer!.id, recipeId: recipe!.id });

  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const plus = (n: number) => new Date(today.getTime() + n * 86_400_000);
  const [promo] = await db
    .insert(promotions)
    .values({ tenantId, name: "Semana", startsOn: iso(plus(-2)), endsOn: iso(plus(5)) })
    .returning();
  await db.insert(promotionItems).values({
    tenantId,
    promotionId: promo!.id,
    productId: ids.molho!,
    rawDescription: "MOLHO GRILL",
    priceCents: 3590,
    priceUnit: "un",
  });

  const [order] = await db
    .insert(orders)
    .values({
      tenantId,
      externalNumber: E2E_ORDER_NUMBER,
      customerId: customer!.id,
      issuedAt: today,
      status: "confirmed",
      totalCents: 3000,
    })
    .returning();
  await db.insert(orderLines).values({
    tenantId,
    orderId: order!.id,
    productId: ids.pao!,
    qty: "2",
    unit: "UN",
    unitPriceCents: 1500,
    totalCents: 3000,
  });
  await runSuggestionsForOrder(db, tenantId, order!.id, today);
  await closeDb();
}
