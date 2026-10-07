import type { Db } from "../db/client";
import { ingredientDisplayName, ingredientKey } from "../normalize";
import { auditRepo, customersRepo, recipesRepo } from "../repos";

const UNITS = ["g", "ml", "un"] as const;
const parseQty = (raw: string) => {
  const n = Number(raw.trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) throw new Error("Quantidade inválida");
  return String(n);
};

export async function saveRecipeDetails(
  db: Db,
  tenantId: string,
  recipeId: string,
  input: {
    name: string;
    yieldPortions: string;
    status: string;
    segmentIds: string[];
  },
  userId?: string,
) {
  const name = input.name.trim();
  if (!name) throw new Error("O nome é obrigatório");
  const yieldPortions = Math.round(Number(input.yieldPortions));
  if (!Number.isFinite(yieldPortions) || yieldPortions < 1) throw new Error("Rendimento inválido");
  const status = input.status === "draft" ? "draft" : "active";
  const dup = await recipesRepo.findRecipeByName(db, tenantId, name);
  if (dup && dup.id !== recipeId) throw new Error("Já existe outra receita com esse nome");
  await recipesRepo.updateRecipe(db, tenantId, recipeId, { name, yieldPortions, status });
  await recipesRepo.setRecipeSegments(db, tenantId, recipeId, input.segmentIds);
  await auditRepo.writeAudit(db, tenantId, {
    userId,
    action: "recipe.update",
    entity: "recipe",
    entityId: recipeId,
    diff: { name, yieldPortions, status, segments: input.segmentIds.length },
  });
}

export async function createBlankRecipe(db: Db, tenantId: string, name: string, userId?: string) {
  const clean = name.trim();
  if (!clean) throw new Error("Informe o nome da receita");
  if (await recipesRepo.findRecipeByName(db, tenantId, clean))
    throw new Error("Já existe uma receita com esse nome");
  const recipe = await recipesRepo.createRecipe(db, tenantId, { name: clean });
  await auditRepo.writeAudit(db, tenantId, {
    userId,
    action: "recipe.create",
    entity: "recipe",
    entityId: recipe.id,
  });
  return recipe.id;
}

export async function saveRecipeItem(
  db: Db,
  tenantId: string,
  itemId: string,
  input: { qty: string; unit: string; isAnchor: boolean; isEssential: boolean },
) {
  if (!UNITS.includes(input.unit as (typeof UNITS)[number])) throw new Error("Unidade inválida");
  const item = await recipesRepo.getRecipeItem(db, tenantId, itemId);
  if (!item) throw new Error("Item não encontrado");
  await recipesRepo.updateRecipeItem(db, tenantId, itemId, {
    qtyPerPortion: parseQty(input.qty),
    unit: input.unit,
    isAnchor: input.isAnchor,
    isEssential: input.isEssential,
  });
  return item.recipeId;
}

export async function addRecipeItem(
  db: Db,
  tenantId: string,
  recipeId: string,
  input: { name: string; qty: string; unit: string },
) {
  if (!UNITS.includes(input.unit as (typeof UNITS)[number])) throw new Error("Unidade inválida");
  const name = ingredientDisplayName(input.name);
  if (!name) throw new Error("Informe o ingrediente");
  const ingredientId = await recipesRepo.upsertIngredient(db, tenantId, name, ingredientKey(name));
  await recipesRepo.upsertRecipeItem(db, tenantId, recipeId, ingredientId, {
    qtyPerPortion: parseQty(input.qty),
    unit: input.unit,
  });
}

export async function removeRecipeItem(db: Db, tenantId: string, itemId: string) {
  const item = await recipesRepo.getRecipeItem(db, tenantId, itemId);
  if (!item) throw new Error("Item não encontrado");
  await recipesRepo.deleteRecipeItem(db, tenantId, itemId);
  return item.recipeId;
}

/** Vínculo manual: o usuário escolheu o produto, então já nasce aprovado. */
export async function linkIngredientToProduct(
  db: Db,
  tenantId: string,
  ingredientId: string,
  productId: string,
  userId?: string,
) {
  await recipesRepo.upsertIngredientLink(db, tenantId, {
    ingredientId,
    productId,
    status: "approved",
    suggestedBy: "user",
  });
  await auditRepo.writeAudit(db, tenantId, {
    userId,
    action: "ingredient.link",
    entity: "ingredient",
    entityId: ingredientId,
    diff: { productId },
  });
}

export async function reviewIngredientLink(
  db: Db,
  tenantId: string,
  linkId: string,
  decision: "approved" | "rejected" | "remove",
) {
  if (decision === "remove") await recipesRepo.deleteIngredientLink(db, tenantId, linkId);
  else await recipesRepo.setIngredientLinkStatus(db, tenantId, linkId, decision);
}

/**
 * Para cada ingrediente da receita sem vínculo, grava como `suggested` os melhores candidatos
 * por trigram (nota mínima 0,2). O re-ranking por IA entra na T08.
 */
export async function suggestProductsForRecipe(db: Db, tenantId: string, recipeId: string) {
  const items = await recipesRepo.listRecipeItems(db, tenantId, recipeId);
  const links = await recipesRepo.listIngredientLinks(
    db,
    tenantId,
    items.map((i) => i.ingredient.id),
  );
  const linked = new Set(
    links.filter((l) => l.link.status !== "rejected").map((l) => l.link.ingredientId),
  );
  const rejected = new Set(links.map((l) => `${l.link.ingredientId}:${l.link.productId}`));
  let created = 0;
  for (const { ingredient } of items) {
    if (linked.has(ingredient.id)) continue;
    const found = await recipesRepo.searchProductsByTrigram(db, tenantId, ingredient.name, 10);
    const picks = found
      .filter((f) => f.score >= 0.2 && !rejected.has(`${ingredient.id}:${f.product.id}`))
      .slice(0, 3);
    for (const [idx, p] of picks.entries()) {
      await recipesRepo.upsertIngredientLink(db, tenantId, {
        ingredientId: ingredient.id,
        productId: p.product.id,
        status: "suggested",
        suggestedBy: "user",
        priority: idx + 1,
      });
      created++;
    }
  }
  return created;
}

export async function confirmCustomerRecipe(
  db: Db,
  tenantId: string,
  customerId: string,
  recipeId: string,
  source: "user" | "segment_suggestion",
  userId?: string,
) {
  const [customer, recipe] = await Promise.all([
    customersRepo.getCustomerById(db, tenantId, customerId),
    recipesRepo.getRecipe(db, tenantId, recipeId),
  ]);
  if (!customer || !recipe) throw new Error("Cliente ou receita não encontrados");
  await recipesRepo.addCustomerRecipe(db, tenantId, { customerId, recipeId, source });
  await auditRepo.writeAudit(db, tenantId, {
    userId,
    action: "customer_recipe.add",
    entity: "customer",
    entityId: customerId,
    diff: { recipeId, source },
  });
}

export async function saveCustomerRecipePortions(
  db: Db,
  tenantId: string,
  id: string,
  portions: string,
) {
  const raw = portions.trim();
  let value: string | null = null;
  if (raw) {
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) throw new Error("Porções por dia inválidas");
    value = String(n);
  }
  await recipesRepo.updateCustomerRecipe(db, tenantId, id, { portionsPerDay: value });
}
