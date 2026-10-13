"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { updateProductFromForm } from "@/server/services/products";

export async function updateProductAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  try {
    await updateProductFromForm(
      getDb(),
      user.tenantId,
      id,
      {
        description: String(formData.get("description") ?? ""),
        brand: String(formData.get("brand") ?? ""),
        packText: String(formData.get("packText") ?? ""),
        saleUnit: String(formData.get("saleUnit") ?? ""),
        price: String(formData.get("price") ?? ""),
        category: String(formData.get("category") ?? ""),
        sellable: formData.get("sellable") === "on",
      },
      user.id,
    );
  } catch (e) {
    redirect(`/produtos/${id}?erro=${encodeURIComponent(e instanceof Error ? e.message : "Erro")}`);
  }
  revalidatePath(`/produtos/${id}`);
  redirect(`/produtos/${id}?salvo=1`);
}
