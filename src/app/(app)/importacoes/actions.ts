"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { CUSTOMER_FIELDS, type CustomerMapping } from "@/server/importers/spreadsheet/customers";
import {
  confirmCustomerImport,
  createCustomerImport,
  remapCustomerImport,
  resolveRowSegment,
  setRowStatus,
} from "@/server/services/import-customers";

const MAX_BYTES = 4 * 1024 * 1024;

export type UploadState = { error?: string };

function back(jobId: string, error?: string): never {
  revalidatePath(`/importacoes/${jobId}`);
  redirect(`/importacoes/${jobId}${error ? `?erro=${encodeURIComponent(error)}` : ""}`);
}

export async function uploadCustomersAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { error: "Escolha um arquivo XLSX ou CSV." };
  if (!/\.(xlsx|csv)$/i.test(file.name)) return { error: "O arquivo precisa ser XLSX ou CSV." };
  if (file.size > MAX_BYTES) return { error: "O arquivo passa de 4 MB." };
  const jobId = await createCustomerImport(getDb(), user.tenantId, {
    buffer: Buffer.from(await file.arrayBuffer()),
    filename: file.name,
    userId: user.id,
  });
  redirect(`/importacoes/${jobId}`);
}

export async function rowStatusAction(formData: FormData) {
  const user = await requireUser();
  const jobId = String(formData.get("jobId"));
  const op = formData.get("op") === "accept" ? "accepted" : "rejected";
  try {
    await setRowStatus(getDb(), user.tenantId, String(formData.get("rowId")), op);
  } catch (e) {
    back(jobId, e instanceof Error ? e.message : "Erro");
  }
  back(jobId);
}

export async function resolveSegmentAction(formData: FormData) {
  const user = await requireUser();
  const jobId = String(formData.get("jobId"));
  const segmentId = String(formData.get("segmentId") ?? "");
  if (!segmentId) back(jobId, "Escolha um segmento.");
  try {
    await resolveRowSegment(getDb(), user.tenantId, String(formData.get("rowId")), segmentId);
  } catch (e) {
    back(jobId, e instanceof Error ? e.message : "Erro");
  }
  back(jobId);
}

export async function remapAction(formData: FormData) {
  const user = await requireUser();
  const jobId = String(formData.get("jobId"));
  const mapping: CustomerMapping = {};
  for (const f of CUSTOMER_FIELDS) {
    const v = String(formData.get(`map_${f}`) ?? "");
    if (v !== "") mapping[f] = Number(v);
  }
  try {
    await remapCustomerImport(getDb(), user.tenantId, jobId, mapping);
  } catch (e) {
    back(jobId, e instanceof Error ? e.message : "Erro");
  }
  back(jobId);
}

export async function confirmAction(formData: FormData) {
  const user = await requireUser();
  const jobId = String(formData.get("jobId"));
  try {
    await confirmCustomerImport(getDb(), user.tenantId, jobId, user.id);
  } catch (e) {
    back(jobId, e instanceof Error ? e.message : "Erro");
  }
  revalidatePath("/clientes");
  back(jobId);
}
