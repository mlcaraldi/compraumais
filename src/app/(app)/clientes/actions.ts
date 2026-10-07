"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { updateCustomerContact } from "@/server/services/customers";
import { recipesRepo } from "@/server/repos";
import { confirmCustomerRecipe, saveCustomerRecipePortions } from "@/server/services/recipes";

export async function updateCustomerAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  await updateCustomerContact(
    getDb(),
    user.tenantId,
    id,
    {
      contactName: String(formData.get("contactName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    },
    user.id,
  );
  revalidatePath(`/clientes/${id}`);
  redirect(`/clientes/${id}?salvo=1`);
}

export async function addCustomerRecipeAction(formData: FormData) {
  const user = await requireUser();
  const customerId = String(formData.get("customerId"));
  const source = formData.get("source") === "segment_suggestion" ? "segment_suggestion" : "user";
  await confirmCustomerRecipe(
    getDb(),
    user.tenantId,
    customerId,
    String(formData.get("recipeId")),
    source,
    user.id,
  );
  revalidatePath(`/clientes/${customerId}`);
  redirect(`/clientes/${customerId}`);
}

export async function saveCustomerRecipeAction(formData: FormData) {
  const user = await requireUser();
  const customerId = String(formData.get("customerId"));
  await saveCustomerRecipePortions(
    getDb(),
    user.tenantId,
    String(formData.get("id")),
    String(formData.get("portions") ?? ""),
  );
  revalidatePath(`/clientes/${customerId}`);
  redirect(`/clientes/${customerId}`);
}

export async function removeCustomerRecipeAction(formData: FormData) {
  const user = await requireUser();
  const customerId = String(formData.get("customerId"));
  await recipesRepo.removeCustomerRecipe(getDb(), user.tenantId, String(formData.get("id")));
  revalidatePath(`/clientes/${customerId}`);
  redirect(`/clientes/${customerId}`);
}
