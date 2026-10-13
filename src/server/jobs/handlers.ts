import type { Db } from "../db/client";
import { AiNullOutputError, AiRetryableError } from "../importers/ai/client";
import { importsRepo } from "../repos";
import { resolveExtractor } from "./extractors";

export const QUEUE_EXTRACT = "import.extract";
export const QUEUE_SUGGESTION = "suggestion.run";
export const RETRY_LIMIT = 2;

export type ExtractJobData = { tenantId: string; jobId: string };
export type SuggestionJobData = { tenantId: string; orderId: string };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Executa a extração de um import_job e reflete o resultado em `import_jobs`.
 * Erro transitório (429, 5xx) volta para `queued` e é relançado para a fila tentar de novo;
 * na última tentativa, ou em erro definitivo, o job vira `failed`.
 */
export async function runExtractJob(
  db: Db,
  data: ExtractJobData,
  opts: { isLastAttempt: boolean } = { isLastAttempt: true },
) {
  const { tenantId, jobId } = data;
  const job = await importsRepo.getImportJob(db, tenantId, jobId);
  if (!job) throw new Error(`Job ${jobId} não encontrado`);
  if (job.status === "done" || job.status === "review") return;
  const extractor = await resolveExtractor(job.kind);
  if (!extractor) {
    await importsRepo.updateImportJob(db, tenantId, jobId, {
      status: "failed",
      error: `Não há extrator para importações do tipo "${job.kind}"`,
    });
    return;
  }
  await importsRepo.updateImportJob(db, tenantId, jobId, { status: "extracting", error: null });
  try {
    await extractor({ db, tenantId, jobId });
  } catch (e) {
    if (e instanceof AiRetryableError && !opts.isLastAttempt) {
      await importsRepo.updateImportJob(db, tenantId, jobId, {
        status: "queued",
        error: `${message(e)} (nova tentativa agendada)`,
      });
      throw e;
    }
    await importsRepo.updateImportJob(db, tenantId, jobId, {
      status: "failed",
      error: message(e),
      ...(e instanceof AiNullOutputError ? { rawOutput: { rawText: e.rawText } } : {}),
    });
  }
}

/** Gera as sugestões de um pedido confirmado (o motor roda em `services/suggestions`). */
export async function runSuggestionJob(db: Db, data: SuggestionJobData) {
  const { runSuggestionsForOrder } = await import("../services/suggestions");
  await runSuggestionsForOrder(db, data.tenantId, data.orderId);
}
