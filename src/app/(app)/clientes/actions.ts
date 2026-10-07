"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { updateCustomerContact } from "@/server/services/customers";

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
