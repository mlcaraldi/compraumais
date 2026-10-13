"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { auditRepo, ordersRepo, suggestionsRepo } from "@/server/repos";
import { runSuggestionsForOrder, SuggestionError } from "@/server/services/suggestions";

export type ActionState = { ok?: boolean; error?: string };

const RESULTS = ["accepted", "partial", "declined", "no_response", "not_sent"] as const;

export async function recalculateAction(_prev: ActionState, formData: FormData) {
  const user = await requireUser();
  const orderId = String(formData.get("orderId") ?? "");
  try {
    await runSuggestionsForOrder(getDb(), user.tenantId, orderId);
  } catch (e) {
    if (e instanceof SuggestionError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/pedidos/${orderId}`);
  return { ok: true };
}

export async function saveMessageAction(_prev: ActionState, formData: FormData) {
  const user = await requireUser();
  const orderId = String(formData.get("orderId") ?? "");
  const messageId = String(formData.get("messageId") ?? "");
  const text = String(formData.get("text") ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!text) return { error: "A mensagem não pode ficar vazia." };
  const db = getDb();
  const run = await suggestionsRepo.getLatestRun(db, user.tenantId, orderId);
  const message = run && (await suggestionsRepo.getRunMessage(db, user.tenantId, run.id));
  if (!message || message.id !== messageId)
    return { error: "A mensagem mudou. Recarregue a página." };
  await suggestionsRepo.saveEditedMessage(
    db,
    user.tenantId,
    message.id,
    text === message.text ? null : text,
  );
  revalidatePath(`/pedidos/${orderId}`);
  return { ok: true };
}

export async function recordOutcomeAction(_prev: ActionState, formData: FormData) {
  const user = await requireUser();
  const orderId = String(formData.get("orderId") ?? "");
  const result = String(formData.get("result") ?? "");
  if (!(RESULTS as readonly string[]).includes(result)) return { error: "Escolha o resultado." };
  const db = getDb();
  const order = await ordersRepo.getOrder(db, user.tenantId, orderId);
  const run = order && (await suggestionsRepo.getLatestRun(db, user.tenantId, orderId));
  if (!run) return { error: "Este pedido ainda não tem sugestões." };
  const suggested = new Set(
    (await suggestionsRepo.listRunItems(db, user.tenantId, run.id))
      .filter((r) => r.item.list !== "reminder")
      .map((r) => r.item.productId),
  );
  let accepted = formData
    .getAll("accepted")
    .map(String)
    .filter((id) => suggested.has(id));
  if (result === "accepted") accepted = [...suggested];
  if (result !== "accepted" && result !== "partial") accepted = [];
  if (result === "partial" && accepted.length === 0)
    return { error: "Marque os itens que o cliente aceitou." };
  const sent = formData.get("sent") === "on" || result !== "not_sent";
  const note = String(formData.get("note") ?? "").trim() || null;
  await suggestionsRepo.recordOutcome(db, user.tenantId, {
    runId: run.id,
    sent: result === "not_sent" ? false : sent,
    result,
    acceptedProductIds: accepted,
    note,
    recordedBy: user.id,
  });
  await auditRepo.writeAudit(db, user.tenantId, {
    userId: user.id,
    action: "outcome.record",
    entity: "suggestion_run",
    entityId: run.id,
    diff: { result, accepted },
  });
  revalidatePath(`/pedidos/${orderId}`);
  return { ok: true };
}
