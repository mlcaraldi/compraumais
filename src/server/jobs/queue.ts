import { PgBoss } from "pg-boss";
import { getDb } from "../db/client";
import {
  QUEUE_EXTRACT,
  QUEUE_SUGGESTION,
  RETRY_LIMIT,
  runExtractJob,
  runSuggestionJob,
  type ExtractJobData,
  type SuggestionJobData,
} from "./handlers";

/**
 * Como os jobs rodam:
 * - `pgboss` (padrão): o app só enfileira; o processo `worker/index.ts` executa.
 * - `inline` (homologação na Vercel, sem processo separado): o próprio app executa depois de
 *   responder, com as mesmas tentativas.
 */
export function jobRunnerMode(): "pgboss" | "inline" {
  return process.env.JOB_RUNNER === "inline" ? "inline" : "pgboss";
}

export const BOSS_SCHEMA = process.env.PGBOSS_SCHEMA ?? "pgboss";

export function createBoss(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL não definida");
  const u = new URL(connectionString);
  const local = ["localhost", "127.0.0.1", "db", "db-test"].includes(u.hostname);
  u.searchParams.delete("sslmode");
  return new PgBoss({
    connectionString: u.toString(),
    schema: BOSS_SCHEMA,
    ssl: local ? undefined : { rejectUnauthorized: false },
    max: 4,
  });
}

export async function createQueues(boss: PgBoss) {
  for (const name of [QUEUE_EXTRACT, QUEUE_SUGGESTION])
    await boss.createQueue(name, { retryLimit: RETRY_LIMIT, retryDelay: 30, retryBackoff: true });
}

const g = globalThis as unknown as { __cmBoss?: Promise<PgBoss> };
async function sender() {
  g.__cmBoss ??= (async () => {
    const boss = createBoss();
    boss.on("error", (e) => console.error("pg-boss:", e));
    await boss.start();
    await createQueues(boss);
    return boss;
  })();
  return g.__cmBoss;
}

async function inline(fn: () => Promise<void>) {
  const attempts = RETRY_LIMIT + 1;
  for (let i = 1; i <= attempts; i++) {
    try {
      await fn();
      return;
    } catch (e) {
      console.error(`job inline, tentativa ${i}/${attempts}:`, e);
      if (i < attempts) await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

/** Roda depois da resposta quando dá (Next `after`), senão em segundo plano. */
async function defer(fn: () => Promise<void>) {
  try {
    const { after } = await import("next/server");
    after(fn);
  } catch {
    void fn();
  }
}

export async function enqueueExtract(data: ExtractJobData) {
  if (jobRunnerMode() === "inline") {
    let attempt = 0;
    await defer(() =>
      inline(async () => {
        attempt++;
        await runExtractJob(getDb(), data, { isLastAttempt: attempt > RETRY_LIMIT });
      }),
    );
    return;
  }
  const boss = await sender();
  await boss.send(QUEUE_EXTRACT, data);
}

export async function enqueueSuggestion(data: SuggestionJobData) {
  if (jobRunnerMode() === "inline") {
    await defer(() => inline(() => runSuggestionJob(getDb(), data)));
    return;
  }
  const boss = await sender();
  await boss.send(QUEUE_SUGGESTION, data);
}

/** Encerra a conexão de envio (testes e scripts). */
export async function stopQueue() {
  if (!g.__cmBoss) return;
  const boss = await g.__cmBoss;
  g.__cmBoss = undefined;
  await boss.stop({ graceful: false });
}
