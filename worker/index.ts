import { getDb, closeDb } from "../src/server/db/client";
import {
  QUEUE_EXTRACT,
  QUEUE_SUGGESTION,
  RETRY_LIMIT,
  runExtractJob,
  runSuggestionJob,
  type ExtractJobData,
  type SuggestionJobData,
} from "../src/server/jobs/handlers";
import { createBoss, createQueues } from "../src/server/jobs/queue";

export async function startWorker(connectionString = process.env.DATABASE_URL) {
  const boss = createBoss(connectionString);
  boss.on("error", (e) => console.error("pg-boss:", e));
  await boss.start();
  await createQueues(boss);
  const poll = Number(process.env.WORKER_POLL_SECONDS ?? 2);
  await boss.work<ExtractJobData>(
    QUEUE_EXTRACT,
    { includeMetadata: true, pollingIntervalSeconds: poll },
    async (jobs) => {
      for (const job of jobs) {
        await runExtractJob(getDb(), job.data, {
          isLastAttempt: job.retryCount >= RETRY_LIMIT,
        });
      }
    },
  );
  await boss.work<SuggestionJobData>(
    QUEUE_SUGGESTION,
    { pollingIntervalSeconds: poll },
    async (jobs) => {
      for (const job of jobs) await runSuggestionJob(getDb(), job.data);
    },
  );
  console.log("worker: aguardando jobs");
  return boss;
}

async function main() {
  const boss = await startWorker();
  const stop = async () => {
    await boss.stop({ graceful: true });
    await closeDb();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

if (process.argv[1]?.endsWith("worker/index.ts") || process.argv[1]?.endsWith("worker/index.js")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
