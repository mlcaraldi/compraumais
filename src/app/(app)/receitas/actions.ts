"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import {
  addRecipeItem,
  createBlankRecipe,
  linkIngredientToProduct,
  removeRecipeItem,
  reviewIngredientLink,
  saveRecipeDetails,
  saveRecipeItem,
  suggestProductsForRecipe,
} from "@/server/services/recipes";
import { createRecipeImport } from "@/server/services/import-recipes";

const MAX_BYTES = 4 * 1024 * 1024;
export type UploadState = { error?: string };

/** Executa a operação; em erro volta para a receita com a mensagem. */
async function run(recipeId: string, op: () => Promise<unknown>, anchor?: string): Promise<never> {
  try {
    await op();
  } catch (e) {
    redirect(
      `/receitas/${recipeId}?erro=${encodeURIComponent(e instanceof Error ? e.message : "Erro")}`,
    );
  }
  revalidatePath(`/receitas/${recipeId}`);
  redirect(`/receitas/${recipeId}${anchor ? `#${anchor}` : ""}`);
}

export async function uploadRecipesAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { error: "Escolha um arquivo XLSX ou CSV." };
  if (!/\.(xlsx|csv)$/i.test(file.name)) return { error: "O arquivo precisa ser XLSX ou CSV." };
  if (file.size > MAX_BYTES) return { error: "O arquivo passa de 4 MB." };
  const jobId = await createRecipeImport(getDb(), user.tenantId, {
    buffer: Buffer.from(await file.arrayBuffer()),
    filename: file.name,
    userId: user.id,
  });
  redirect(`/importacoes/${jobId}`);
}

export async function createRecipeAction(formData: FormData) {
  const user = await requireUser();
  let id: string;
  try {
    id = await createBlankRecipe(
      getDb(),
      user.tenantId,
      String(formData.get("name") ?? ""),
      user.id,
    );
  } catch (e) {
    redirect(`/receitas?erro=${encodeURIComponent(e instanceof Error ? e.message : "Erro")}`);
  }
  revalidatePath("/receitas");
  redirect(`/receitas/${id}`);
}

export async function saveRecipeAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  await run(id, () =>
    saveRecipeDetails(
      getDb(),
      user.tenantId,
      id,
      {
        name: String(formData.get("name") ?? ""),
        yieldPortions: String(formData.get("yieldPortions") ?? "1"),
        status: String(formData.get("status") ?? "active"),
        segmentIds: formData.getAll("segmentIds").map(String),
      },
      user.id,
    ),
  );
}

export async function saveItemAction(formData: FormData) {
  const user = await requireUser();
  const recipeId = String(formData.get("recipeId"));
  const itemId = String(formData.get("itemId"));
  await run(
    recipeId,
    () =>
      saveRecipeItem(getDb(), user.tenantId, itemId, {
        qty: String(formData.get("qty") ?? ""),
        unit: String(formData.get("unit") ?? ""),
        isAnchor: formData.get("isAnchor") === "on",
        isEssential: formData.get("isEssential") === "on",
      }),
    `item-${itemId}`,
  );
}

export async function addItemAction(formData: FormData) {
  const user = await requireUser();
  const recipeId = String(formData.get("recipeId"));
  await run(recipeId, () =>
    addRecipeItem(getDb(), user.tenantId, recipeId, {
      name: String(formData.get("name") ?? ""),
      qty: String(formData.get("qty") ?? ""),
      unit: String(formData.get("unit") ?? "g"),
    }),
  );
}

export async function removeItemAction(formData: FormData) {
  const user = await requireUser();
  const recipeId = String(formData.get("recipeId"));
  await run(recipeId, () =>
    removeRecipeItem(getDb(), user.tenantId, String(formData.get("itemId"))),
  );
}

export async function linkProductAction(formData: FormData) {
  const user = await requireUser();
  const recipeId = String(formData.get("recipeId"));
  const itemId = String(formData.get("itemId"));
  await run(
    recipeId,
    () =>
      linkIngredientToProduct(
        getDb(),
        user.tenantId,
        String(formData.get("ingredientId")),
        String(formData.get("productId")),
        user.id,
      ),
    `item-${itemId}`,
  );
}

export async function reviewLinkAction(formData: FormData) {
  const user = await requireUser();
  const recipeId = String(formData.get("recipeId"));
  const op = String(formData.get("op"));
  const decision = op === "approve" ? "approved" : op === "reject" ? "rejected" : "remove";
  await run(
    recipeId,
    () => reviewIngredientLink(getDb(), user.tenantId, String(formData.get("linkId")), decision),
    `item-${String(formData.get("itemId"))}`,
  );
}

export async function suggestProductsAction(formData: FormData) {
  const user = await requireUser();
  const recipeId = String(formData.get("recipeId"));
  await run(recipeId, () => suggestProductsForRecipe(getDb(), user.tenantId, recipeId));
}
