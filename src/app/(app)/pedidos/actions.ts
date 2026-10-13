"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { enqueueExtract } from "@/server/jobs/queue";
import { parseMoneyCents } from "@/server/normalize";
import { createOrderUpload, createTypedOrder } from "@/server/services/import-order";

const MAX_BYTES = 4 * 1024 * 1024;
export type UploadState = { error?: string };

export async function uploadOrderAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Escolha um PDF ou imagem." };
  if (!/\.(pdf|jpe?g|png|webp)$/i.test(file.name))
    return { error: "O pedido precisa ser PDF, JPG, PNG ou WEBP." };
  if (file.size > MAX_BYTES) return { error: "O arquivo passa de 4 MB." };
  const db = getDb();
  const jobId = await createOrderUpload(db, user.tenantId, {
    buffer: Buffer.from(await file.arrayBuffer()),
    filename: file.name,
    userId: user.id,
  });
  await enqueueExtract({ tenantId: user.tenantId, jobId });
  redirect(`/importacoes/${jobId}`);
}

function toNumber(raw: string) {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

export async function createTypedOrderAction(formData: FormData) {
  const user = await requireUser();
  const fail = (msg: string): never => redirect(`/pedidos/novo?erro=${encodeURIComponent(msg)}`);
  const customerCode = String(formData.get("customer") ?? "")
    .split("|")[0]!
    .trim();
  if (!customerCode) fail("Escolha o cliente.");
  const db = getDb();
  const { customersRepo } = await import("@/server/repos");
  const customer = await customersRepo.findCustomerByExternalCode(db, user.tenantId, customerCode);
  if (!customer) fail("Cliente não encontrado; escolha um da lista.");
  const lines: { code: string; qty: number; unitPriceCents: number; description?: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const code = String(formData.get(`code_${i}`) ?? "").trim();
    const qtyRaw = String(formData.get(`qty_${i}`) ?? "").trim();
    const priceRaw = String(formData.get(`price_${i}`) ?? "").trim();
    if (!code && !qtyRaw && !priceRaw) continue;
    const qty = toNumber(qtyRaw);
    const price = parseMoneyCents(priceRaw);
    if (!code || !(qty > 0) || price === null)
      fail(`Linha ${i + 1}: informe código, quantidade e preço.`);
    lines.push({
      code,
      qty,
      unitPriceCents: price!,
      description: String(formData.get(`desc_${i}`) ?? "").trim() || undefined,
    });
  }
  if (lines.length === 0) fail("Informe pelo menos uma linha.");
  const issuedAt = String(formData.get("issuedAt") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedAt)) fail("Informe a data do pedido.");
  let result;
  try {
    result = await createTypedOrder(db, user.tenantId, {
      customerId: customer!.id,
      orderNumber: String(formData.get("orderNumber") ?? "") || undefined,
      issuedAt,
      lines,
      userId: user.id,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Erro ao criar o pedido");
  }
  revalidatePath("/pedidos");
  if (result.orderId) {
    const { enqueueSuggestion } = await import("@/server/jobs/queue");
    await enqueueSuggestion({ tenantId: user.tenantId, orderId: result.orderId });
    redirect(`/pedidos/${result.orderId}`);
  }
  redirect(`/importacoes/${result.jobId}`);
}
