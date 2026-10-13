"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { enqueueExtract } from "@/server/jobs/queue";
import { createPromotionUpload } from "@/server/services/import-promotion";

const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
export type UploadState = { error?: string };

/** Vários encartes de uma vez: cada arquivo vira uma importação própria. */
export async function uploadPromotionsAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const user = await requireUser();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Escolha pelo menos um encarte (imagem ou PDF)." };
  const bad = files.find((f) => !/\.(pdf|jpe?g|png|webp)$/i.test(f.name));
  if (bad) return { error: `"${bad.name}" não é imagem nem PDF.` };
  if (files.reduce((a, f) => a + f.size, 0) > MAX_TOTAL_BYTES)
    return { error: "Os arquivos passam de 4 MB no total; envie em lotes menores." };
  const db = getDb();
  const jobIds: string[] = [];
  for (const f of files) {
    const jobId = await createPromotionUpload(db, user.tenantId, {
      buffer: Buffer.from(await f.arrayBuffer()),
      filename: f.name,
      userId: user.id,
    });
    await enqueueExtract({ tenantId: user.tenantId, jobId });
    jobIds.push(jobId);
  }
  redirect(jobIds.length === 1 ? `/importacoes/${jobIds[0]}` : "/importacoes");
}
