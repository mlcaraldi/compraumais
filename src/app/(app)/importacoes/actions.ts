"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { CUSTOMER_FIELDS, type CustomerMapping } from "@/server/importers/spreadsheet/customers";
import { PRODUCT_FIELDS, type ProductMapping } from "@/server/importers/spreadsheet/products";
import { importsRepo } from "@/server/repos";
import { enqueueExtract, enqueueSuggestion } from "@/server/jobs/queue";
import { parseMoneyCents } from "@/server/normalize";
import {
  confirmOrderImport,
  editOrderHeader,
  editOrderLine,
  setOrderCustomer,
  setOrderRowStatus,
} from "@/server/services/import-order";
import { confirmRecipeImport } from "@/server/services/import-recipes";
import {
  confirmProductImport,
  createProductImport,
  remapProductImport,
} from "@/server/services/import-products";
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

export async function uploadProductsAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { error: "Escolha um arquivo XLSX ou CSV." };
  if (!/\.(xlsx|csv)$/i.test(file.name)) return { error: "O arquivo precisa ser XLSX ou CSV." };
  if (file.size > MAX_BYTES) return { error: "O arquivo passa de 4 MB." };
  const jobId = await createProductImport(getDb(), user.tenantId, {
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
  const job = await importsRepo.getImportJob(getDb(), user.tenantId, jobId);
  const pick = (fields: readonly string[]) => {
    const m: Record<string, number> = {};
    for (const f of fields) {
      const v = String(formData.get(`map_${f}`) ?? "");
      if (v !== "") m[f] = Number(v);
    }
    return m;
  };
  try {
    if (job?.kind === "products") {
      await remapProductImport(
        getDb(),
        user.tenantId,
        jobId,
        pick(PRODUCT_FIELDS) as ProductMapping,
      );
    } else {
      await remapCustomerImport(
        getDb(),
        user.tenantId,
        jobId,
        pick(CUSTOMER_FIELDS) as CustomerMapping,
      );
    }
  } catch (e) {
    back(jobId, e instanceof Error ? e.message : "Erro");
  }
  back(jobId);
}

export async function confirmAction(formData: FormData) {
  const user = await requireUser();
  const jobId = String(formData.get("jobId"));
  const job = await importsRepo.getImportJob(getDb(), user.tenantId, jobId);
  if (job?.kind === "order") {
    let orderId: string;
    try {
      ({ orderId } = await confirmOrderImport(getDb(), user.tenantId, jobId, user.id));
    } catch (e) {
      return back(jobId, e instanceof Error ? e.message : "Erro");
    }
    await enqueueSuggestion({ tenantId: user.tenantId, orderId });
    revalidatePath("/pedidos");
    redirect(`/pedidos/${orderId}`);
  }
  try {
    if (job?.kind === "products")
      await confirmProductImport(getDb(), user.tenantId, jobId, user.id);
    else if (job?.kind === "recipes")
      await confirmRecipeImport(getDb(), user.tenantId, jobId, user.id);
    else await confirmCustomerImport(getDb(), user.tenantId, jobId, user.id);
  } catch (e) {
    back(jobId, e instanceof Error ? e.message : "Erro");
  }
  revalidatePath("/clientes");
  revalidatePath("/produtos");
  revalidatePath("/receitas");
  back(jobId);
}

function numberFrom(raw: FormDataEntryValue | null) {
  const n = Number(String(raw ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

export async function orderCustomerAction(formData: FormData) {
  const user = await requireUser();
  const jobId = String(formData.get("jobId"));
  const customerId = String(formData.get("customerId") ?? "");
  const code = String(formData.get("code") ?? "");
  try {
    if (!customerId && !code.trim()) throw new Error("Escolha uma sugestão ou digite o código.");
    await setOrderCustomer(getDb(), user.tenantId, jobId, {
      customerId: customerId || undefined,
      code,
    });
  } catch (e) {
    back(jobId, e instanceof Error ? e.message : "Erro");
  }
  back(jobId);
}

export async function orderHeaderAction(formData: FormData) {
  const user = await requireUser();
  const jobId = String(formData.get("jobId"));
  try {
    await editOrderHeader(getDb(), user.tenantId, jobId, {
      orderNumber: String(formData.get("orderNumber") ?? ""),
      issuedAt: String(formData.get("issuedAt") ?? ""),
    });
  } catch (e) {
    back(jobId, e instanceof Error ? e.message : "Erro");
  }
  back(jobId);
}

export async function orderLineAction(formData: FormData) {
  const user = await requireUser();
  const jobId = String(formData.get("jobId"));
  try {
    const price = parseMoneyCents(String(formData.get("price") ?? ""));
    await editOrderLine(getDb(), user.tenantId, String(formData.get("rowId")), {
      code: String(formData.get("code") ?? ""),
      description: String(formData.get("description") ?? ""),
      qty: numberFrom(formData.get("qty")),
      unitPriceCents: price ?? undefined,
    });
  } catch (e) {
    back(jobId, e instanceof Error ? e.message : "Erro");
  }
  back(jobId);
}

export async function orderRowStatusAction(formData: FormData) {
  const user = await requireUser();
  const jobId = String(formData.get("jobId"));
  const op = formData.get("op") === "accept" ? "accepted" : "rejected";
  try {
    await setOrderRowStatus(getDb(), user.tenantId, String(formData.get("rowId")), op);
  } catch (e) {
    back(jobId, e instanceof Error ? e.message : "Erro");
  }
  back(jobId);
}

/** Recoloca na fila uma leitura por IA que falhou. */
export async function retryExtractAction(formData: FormData) {
  const user = await requireUser();
  const jobId = String(formData.get("jobId"));
  const job = await importsRepo.getImportJob(getDb(), user.tenantId, jobId);
  if (!job || job.status !== "failed" || !["order", "promotion"].includes(job.kind))
    back(jobId, "Esta importação não pode ser repetida.");
  await importsRepo.updateImportJob(getDb(), user.tenantId, jobId, {
    status: "queued",
    error: null,
  });
  await enqueueExtract({ tenantId: user.tenantId, jobId });
  back(jobId);
}
