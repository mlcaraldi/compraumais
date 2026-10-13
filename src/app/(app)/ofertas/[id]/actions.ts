"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import {
  closePromotion,
  PromotionError,
  updatePromotionValidity,
} from "@/server/services/promotions";

export type ActionState = { ok?: boolean; error?: string };

export async function updateValidityAction(_prev: ActionState, formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  try {
    await updatePromotionValidity(getDb(), user.tenantId, user.id, id, {
      name: String(formData.get("name") ?? ""),
      startsOn: String(formData.get("startsOn") ?? ""),
      endsOn: String(formData.get("endsOn") ?? ""),
    });
  } catch (e) {
    if (e instanceof PromotionError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/ofertas/${id}`);
  revalidatePath("/ofertas");
  return { ok: true };
}

export async function closePromotionAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  try {
    await closePromotion(getDb(), user.tenantId, user.id, id);
  } catch (e) {
    if (!(e instanceof PromotionError)) throw e;
  }
  revalidatePath(`/ofertas/${id}`);
  revalidatePath("/ofertas");
}
