import { readFileSync } from "node:fs";
import path from "node:path";
import type { Db } from "../db/client";
import { runExtractJob } from "../jobs/handlers";
import { importsRepo } from "../repos";
import { confirmCustomerImport, createCustomerImport } from "./import-customers";
import { confirmOrderImport, createOrderUpload } from "./import-order";
import { confirmProductImport, createProductImport } from "./import-products";
import { confirmPromotionImport, createPromotionUpload } from "./import-promotion";
import { confirmRecipeImport, createRecipeImport } from "./import-recipes";
import { runSuggestionsForOrder } from "./suggestions";

export const IMPORT_KINDS = ["customers", "products", "recipes", "order", "promotion"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export type CliImportResult = {
  jobId: string;
  /** `confirmed`: gravado; `review`: ficou para revisão humana; `failed`: erro na leitura */
  outcome: "confirmed" | "review" | "failed";
  pending: number;
  detail: string;
  /** só para pedidos confirmados */
  orderId?: string;
};

/**
 * Importa um arquivo pelo mesmo caminho da interface. Com `autoConfirm`, só confirma quando não
 * sobra nenhuma linha pendente; qualquer pendência deixa a importação inteira em revisão na tela
 * (nada de IA entra nas tabelas finais sem revisão humana quando há dúvida).
 */
export async function runImport(
  db: Db,
  tenantId: string,
  input: { kind: ImportKind; file: string; autoConfirm?: boolean; userId?: string },
): Promise<CliImportResult> {
  const buffer = readFileSync(input.file);
  const filename = path.basename(input.file);
  const common = { buffer, filename, userId: input.userId };

  let jobId: string;
  if (input.kind === "customers") jobId = await createCustomerImport(db, tenantId, common);
  else if (input.kind === "products") jobId = await createProductImport(db, tenantId, common);
  else if (input.kind === "recipes") jobId = await createRecipeImport(db, tenantId, common);
  else {
    jobId =
      input.kind === "order"
        ? await createOrderUpload(db, tenantId, common)
        : await createPromotionUpload(db, tenantId, common);
    // extração por IA: roda na hora, no mesmo processo
    await runExtractJob(db, { tenantId, jobId });
  }

  const job = (await importsRepo.getImportJob(db, tenantId, jobId))!;
  if (job.status === "failed")
    return { jobId, outcome: "failed", pending: 0, detail: job.error ?? "Falha na leitura" };
  const counts = await importsRepo.countImportRowsByStatus(db, tenantId, jobId);
  const pending = counts.pending ?? 0;
  if (!input.autoConfirm || pending > 0 || job.status !== "review")
    return {
      jobId,
      outcome: "review",
      pending,
      detail: pending
        ? `${pending} linha(s) pendente(s): revise em /importacoes/${jobId}`
        : `Em revisão: /importacoes/${jobId}`,
    };

  if (input.kind === "customers") await confirmCustomerImport(db, tenantId, jobId, input.userId);
  else if (input.kind === "products") await confirmProductImport(db, tenantId, jobId, input.userId);
  else if (input.kind === "recipes") await confirmRecipeImport(db, tenantId, jobId, input.userId);
  else if (input.kind === "promotion")
    await confirmPromotionImport(db, tenantId, jobId, input.userId);
  else {
    const { orderId } = await confirmOrderImport(db, tenantId, jobId, input.userId);
    await runSuggestionsForOrder(db, tenantId, orderId);
    return { jobId, outcome: "confirmed", pending: 0, detail: `Pedido ${orderId}`, orderId };
  }
  return { jobId, outcome: "confirmed", pending: 0, detail: "Importação confirmada" };
}
