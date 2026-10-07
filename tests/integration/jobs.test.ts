import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { AiNullOutputError, AiRetryableError } from "@/server/importers/ai/client";
import { clearExtractors, registerExtractor } from "@/server/jobs/extractors";
import { runExtractJob } from "@/server/jobs/handlers";
import { enqueueExtract, stopQueue } from "@/server/jobs/queue";
import { importsRepo } from "@/server/repos";
import { saveDocument } from "@/server/storage/documents";
import { startWorker } from "../../worker";
import { closeDb, resetTestDb, TEST_DATABASE_URL } from "../helpers/db";

let ctx: Awaited<ReturnType<typeof resetTestDb>>;
let n = 0;

beforeAll(async () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query("drop schema if exists pgboss cascade");
  await pool.end();
  ctx = await resetTestDb();
});
afterEach(clearExtractors);
afterAll(async () => {
  await stopQueue();
  await closeDb();
});

async function newJob(kind: "products" | "order" = "products") {
  const { document } = await saveDocument(ctx.db, ctx.tenantId, {
    buffer: Buffer.from(`conteúdo ${++n}`),
    filename: `arquivo-${n}.csv`,
    kind,
  });
  return importsRepo.createImportJob(ctx.db, ctx.tenantId, {
    documentId: document.id,
    kind,
    status: "queued",
    createdBy: null,
  });
}
const status = async (id: string) => (await importsRepo.getImportJob(ctx.db, ctx.tenantId, id))!;

describe("runExtractJob", () => {
  it("sucesso: queued vira review pelo extrator", async () => {
    registerExtractor("products", async ({ db, tenantId, jobId }) => {
      await importsRepo.updateImportJob(db, tenantId, jobId, { status: "review" });
    });
    const job = await newJob();
    await runExtractJob(ctx.db, { tenantId: ctx.tenantId, jobId: job.id });
    expect((await status(job.id)).status).toBe("review");
  });

  it("erro repetível fora da última tentativa volta para a fila e relança", async () => {
    registerExtractor("products", async () => {
      throw new AiRetryableError("429");
    });
    const job = await newJob();
    await expect(
      runExtractJob(ctx.db, { tenantId: ctx.tenantId, jobId: job.id }, { isLastAttempt: false }),
    ).rejects.toBeInstanceOf(AiRetryableError);
    expect((await status(job.id)).status).toBe("queued");
    await runExtractJob(ctx.db, { tenantId: ctx.tenantId, jobId: job.id }, { isLastAttempt: true });
    const last = await status(job.id);
    expect(last.status).toBe("failed");
    expect(last.error).toContain("429");
  });

  it("resposta fora do schema falha o job e guarda o texto bruto", async () => {
    registerExtractor("products", async () => {
      throw new AiNullOutputError("texto bruto da IA");
    });
    const job = await newJob();
    await runExtractJob(ctx.db, { tenantId: ctx.tenantId, jobId: job.id });
    const j = await status(job.id);
    expect(j.status).toBe("failed");
    expect(j.rawOutput).toEqual({ rawText: "texto bruto da IA" });
  });

  it("tipo sem extrator falha com mensagem clara", async () => {
    const job = await newJob("order");
    await runExtractJob(ctx.db, { tenantId: ctx.tenantId, jobId: job.id });
    const j = await status(job.id);
    expect(j.status).toBe("failed");
    expect(j.error).toContain("order");
  });
});

describe("worker pg-boss", () => {
  it("processa um job enfileirado e atualiza o status em import_jobs", async () => {
    process.env.WORKER_POLL_SECONDS = "0.5";
    registerExtractor("products", async ({ db, tenantId, jobId }) => {
      await importsRepo.updateImportJob(db, tenantId, jobId, { status: "review" });
    });
    const boss = await startWorker(TEST_DATABASE_URL);
    try {
      const job = await newJob();
      await enqueueExtract({ tenantId: ctx.tenantId, jobId: job.id });
      const deadline = Date.now() + 20_000;
      let current = (await status(job.id)).status;
      while (current !== "review" && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 300));
        current = (await status(job.id)).status;
      }
      expect(current).toBe("review");
    } finally {
      await boss.stop({ graceful: false });
    }
  }, 30_000);
});
