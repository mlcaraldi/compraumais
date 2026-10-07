import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  customerRecipes,
  ingredientProducts,
  ingredients,
  products,
  recipeItems,
  recipeSegments,
  recipes,
  segments,
} from "../db/schema";
import { normalizeText } from "../normalize/text";
import { requireTenant } from "./tenant";

export type Recipe = typeof recipes.$inferSelect;
export type RecipeItem = typeof recipeItems.$inferSelect;
export type IngredientLink = typeof ingredientProducts.$inferSelect;

export async function listRecipes(db: Db, tenantId: string, q?: string) {
  requireTenant(tenantId);
  const term = q?.trim();
  return db
    .select({
      recipe: recipes,
      itemCount: sql<number>`(select count(*)::int from recipe_items i where i.recipe_id = ${recipes.id})`,
      segmentNames: sql<
        string[]
      >`coalesce((select array_agg(s.name order by s.name) from recipe_segments rs join segments s on s.id = rs.segment_id where rs.recipe_id = ${recipes.id}), '{}')`,
    })
    .from(recipes)
    .where(
      and(
        eq(recipes.tenantId, tenantId),
        term ? sql`unaccent(${recipes.name}) ilike unaccent(${"%" + term + "%"})` : undefined,
      ),
    )
    .orderBy(asc(recipes.name));
}

export async function getRecipe(db: Db, tenantId: string, id: string) {
  requireTenant(tenantId);
  const [recipe] = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.tenantId, tenantId), eq(recipes.id, id)));
  return recipe ?? null;
}

export async function findRecipeByName(db: Db, tenantId: string, name: string) {
  requireTenant(tenantId);
  const [row] = await db
    .select()
    .from(recipes)
    .where(
      and(
        eq(recipes.tenantId, tenantId),
        sql`unaccent(lower(${recipes.name})) = unaccent(lower(${name}))`,
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function createRecipe(
  db: Db,
  tenantId: string,
  values: {
    name: string;
    yieldPortions?: number;
    sourceDocumentId?: string | null;
    status?: "draft" | "active";
  },
) {
  requireTenant(tenantId);
  const [row] = await db
    .insert(recipes)
    .values({ ...values, tenantId })
    .returning();
  return row!;
}

export async function updateRecipe(
  db: Db,
  tenantId: string,
  id: string,
  patch: Partial<Pick<Recipe, "name" | "yieldPortions" | "status">>,
) {
  requireTenant(tenantId);
  await db
    .update(recipes)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(recipes.tenantId, tenantId), eq(recipes.id, id)));
}

export async function deleteRecipe(db: Db, tenantId: string, id: string) {
  requireTenant(tenantId);
  await db.delete(recipes).where(and(eq(recipes.tenantId, tenantId), eq(recipes.id, id)));
}

export async function listRecipeSegmentIds(db: Db, tenantId: string, recipeId: string) {
  requireTenant(tenantId);
  const rows = await db
    .select({ segmentId: recipeSegments.segmentId })
    .from(recipeSegments)
    .where(and(eq(recipeSegments.tenantId, tenantId), eq(recipeSegments.recipeId, recipeId)));
  return rows.map((r) => r.segmentId);
}

export async function setRecipeSegments(
  db: Db,
  tenantId: string,
  recipeId: string,
  segmentIds: string[],
) {
  requireTenant(tenantId);
  await db
    .delete(recipeSegments)
    .where(and(eq(recipeSegments.tenantId, tenantId), eq(recipeSegments.recipeId, recipeId)));
  const unique = [...new Set(segmentIds)];
  if (unique.length)
    await db
      .insert(recipeSegments)
      .values(unique.map((segmentId) => ({ tenantId, recipeId, segmentId })));
}

export async function findSegmentIdsByCode(db: Db, tenantId: string, codes: string[]) {
  requireTenant(tenantId);
  if (!codes.length) return [];
  const rows = await db
    .select({ id: segments.id })
    .from(segments)
    .where(and(eq(segments.tenantId, tenantId), inArray(segments.code, codes)));
  return rows.map((r) => r.id);
}

export async function upsertIngredient(db: Db, tenantId: string, name: string, key: string) {
  requireTenant(tenantId);
  const [row] = await db
    .insert(ingredients)
    .values({ tenantId, name, normalizedName: key })
    .onConflictDoUpdate({
      target: [ingredients.tenantId, ingredients.normalizedName],
      set: { normalizedName: key },
    })
    .returning({ id: ingredients.id });
  return row!.id;
}

export async function listIngredientKeys(db: Db, tenantId: string) {
  requireTenant(tenantId);
  const rows = await db
    .select({ id: ingredients.id, key: ingredients.normalizedName })
    .from(ingredients)
    .where(eq(ingredients.tenantId, tenantId));
  return new Map(rows.map((r) => [r.key, r.id]));
}

export async function listRecipeItems(db: Db, tenantId: string, recipeId: string) {
  requireTenant(tenantId);
  return db
    .select({ item: recipeItems, ingredient: ingredients })
    .from(recipeItems)
    .innerJoin(ingredients, eq(ingredients.id, recipeItems.ingredientId))
    .where(and(eq(recipeItems.tenantId, tenantId), eq(recipeItems.recipeId, recipeId)))
    .orderBy(asc(ingredients.name));
}

export async function getRecipeItem(db: Db, tenantId: string, itemId: string) {
  requireTenant(tenantId);
  const [row] = await db
    .select()
    .from(recipeItems)
    .where(and(eq(recipeItems.tenantId, tenantId), eq(recipeItems.id, itemId)));
  return row ?? null;
}

export type RecipeItemValues = {
  qtyPerPortion: string;
  unit: string;
  isAnchor?: boolean;
  isEssential?: boolean;
  packSizeHint?: string | null;
  packPriceHintCents?: number | null;
};

/** Cria ou atualiza o item (receita + ingrediente). */
export async function upsertRecipeItem(
  db: Db,
  tenantId: string,
  recipeId: string,
  ingredientId: string,
  values: RecipeItemValues,
) {
  requireTenant(tenantId);
  await db
    .insert(recipeItems)
    .values({ ...values, tenantId, recipeId, ingredientId })
    .onConflictDoUpdate({
      target: [recipeItems.recipeId, recipeItems.ingredientId],
      set: {
        qtyPerPortion: values.qtyPerPortion,
        unit: values.unit,
        packSizeHint: values.packSizeHint ?? null,
        packPriceHintCents: values.packPriceHintCents ?? null,
      },
    });
}

export async function updateRecipeItem(
  db: Db,
  tenantId: string,
  itemId: string,
  patch: Partial<Pick<RecipeItem, "qtyPerPortion" | "unit" | "isAnchor" | "isEssential">>,
) {
  requireTenant(tenantId);
  await db
    .update(recipeItems)
    .set(patch)
    .where(and(eq(recipeItems.tenantId, tenantId), eq(recipeItems.id, itemId)));
}

export async function deleteRecipeItem(db: Db, tenantId: string, itemId: string) {
  requireTenant(tenantId);
  await db
    .delete(recipeItems)
    .where(and(eq(recipeItems.tenantId, tenantId), eq(recipeItems.id, itemId)));
}

export async function listIngredientLinks(db: Db, tenantId: string, ingredientIds: string[]) {
  requireTenant(tenantId);
  if (!ingredientIds.length) return [];
  return db
    .select({ link: ingredientProducts, product: products })
    .from(ingredientProducts)
    .innerJoin(products, eq(products.id, ingredientProducts.productId))
    .where(
      and(
        eq(ingredientProducts.tenantId, tenantId),
        inArray(ingredientProducts.ingredientId, ingredientIds),
      ),
    )
    .orderBy(asc(ingredientProducts.priority), asc(products.description));
}

export async function upsertIngredientLink(
  db: Db,
  tenantId: string,
  v: {
    ingredientId: string;
    productId: string;
    status: "suggested" | "approved" | "rejected";
    suggestedBy: "ai" | "user";
    priority?: number;
  },
) {
  requireTenant(tenantId);
  await db
    .insert(ingredientProducts)
    .values({ ...v, tenantId })
    .onConflictDoUpdate({
      target: [ingredientProducts.ingredientId, ingredientProducts.productId],
      set: { status: v.status, suggestedBy: v.suggestedBy },
    });
}

export async function setIngredientLinkStatus(
  db: Db,
  tenantId: string,
  linkId: string,
  status: "suggested" | "approved" | "rejected",
) {
  requireTenant(tenantId);
  await db
    .update(ingredientProducts)
    .set({ status })
    .where(and(eq(ingredientProducts.tenantId, tenantId), eq(ingredientProducts.id, linkId)));
}

export async function deleteIngredientLink(db: Db, tenantId: string, linkId: string) {
  requireTenant(tenantId);
  await db
    .delete(ingredientProducts)
    .where(and(eq(ingredientProducts.tenantId, tenantId), eq(ingredientProducts.id, linkId)));
}

/** Produtos mais parecidos com o texto por similaridade trigram (pg_trgm) sobre `search_text`. */
export async function searchProductsByTrigram(db: Db, tenantId: string, q: string, limit = 10) {
  requireTenant(tenantId);
  const term = normalizeText(q);
  if (!term) return [];
  const score = sql<number>`similarity(${products.searchText}, ${term})`;
  const contains = sql`${products.searchText} like ${"%" + term + "%"}`;
  return db
    .select({ product: products, score })
    .from(products)
    .where(
      and(
        eq(products.tenantId, tenantId),
        eq(products.sellable, true),
        sql`(${contains} or ${score} > 0.1)`,
      ),
    )
    .orderBy(sql`${score} desc`, asc(products.description))
    .limit(limit);
}

export async function listCustomerRecipes(db: Db, tenantId: string, customerId: string) {
  requireTenant(tenantId);
  return db
    .select({ link: customerRecipes, recipe: recipes })
    .from(customerRecipes)
    .innerJoin(recipes, eq(recipes.id, customerRecipes.recipeId))
    .where(and(eq(customerRecipes.tenantId, tenantId), eq(customerRecipes.customerId, customerId)))
    .orderBy(asc(recipes.name));
}

export async function suggestRecipesForSegment(
  db: Db,
  tenantId: string,
  customerId: string,
  segmentId: string | null,
) {
  requireTenant(tenantId);
  if (!segmentId) return [];
  return db
    .select({ recipe: recipes })
    .from(recipes)
    .innerJoin(recipeSegments, eq(recipeSegments.recipeId, recipes.id))
    .where(
      and(
        eq(recipes.tenantId, tenantId),
        eq(recipeSegments.segmentId, segmentId),
        eq(recipes.status, "active"),
        sql`not exists (select 1 from customer_recipes cr where cr.recipe_id = ${recipes.id} and cr.customer_id = ${customerId})`,
      ),
    )
    .orderBy(asc(recipes.name));
}

export async function addCustomerRecipe(
  db: Db,
  tenantId: string,
  v: {
    customerId: string;
    recipeId: string;
    source: "user" | "segment_suggestion";
    portionsPerDay?: string | null;
  },
) {
  requireTenant(tenantId);
  await db
    .insert(customerRecipes)
    .values({ ...v, tenantId, confirmed: true })
    .onConflictDoUpdate({
      target: [customerRecipes.customerId, customerRecipes.recipeId],
      set: { confirmed: true },
    });
}

export async function updateCustomerRecipe(
  db: Db,
  tenantId: string,
  id: string,
  patch: { portionsPerDay?: string | null; confirmed?: boolean },
) {
  requireTenant(tenantId);
  await db
    .update(customerRecipes)
    .set(patch)
    .where(and(eq(customerRecipes.tenantId, tenantId), eq(customerRecipes.id, id)));
}

export async function removeCustomerRecipe(db: Db, tenantId: string, id: string) {
  requireTenant(tenantId);
  await db
    .delete(customerRecipes)
    .where(and(eq(customerRecipes.tenantId, tenantId), eq(customerRecipes.id, id)));
}
