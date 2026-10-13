import type { Db } from "../db/client";
import { extractStructured, AiPermanentError, type AiAttachment } from "../importers/ai/client";
import { loadPrompt } from "../importers/ai/rank-products";
import { OrderExtractionSchema } from "../importers/ai/schemas";
import {
  postProcessOrder,
  validateOrderHeader,
  validateOrderLine,
  type OrderHeaderData,
  type OrderLineData,
} from "../importers/order/postprocess";
import { buildProductSearchText, normalizeSaleUnit } from "../importers/spreadsheet/products";
import type { RowWarning } from "../importers/types";
import { block } from "../importers/types";
import { normalizeDocument, parsePack, parseProductCode } from "../normalize";
import type { ExtractContext } from "../jobs/extractors";
import {
  auditRepo,
  customersRepo,
  documentsRepo,
  importsRepo,
  ordersRepo,
  productsRepo,
} from "../repos";
import { readDocument, saveDocument } from "../storage/documents";

export type { OrderHeaderData, OrderLineData };

type JobKind = "order";

/** Meio-dia em Brasília: evita virar o dia ao converter para UTC. */
export const isoToIssuedAt = (iso: string) => new Date(`${iso}T12:00:00-03:00`);

type HeaderInput = Omit<OrderHeaderData, "customerId" | "suggestions">;

async function matchCustomer(db: Db, tenantId: string, header: HeaderInput) {
  const doc = header.customer.document ? normalizeDocument(header.customer.document).digits : "";
  const byDoc = doc ? await customersRepo.findCustomerByDocument(db, tenantId, doc) : null;
  if (byDoc) return { customerId: byDoc.id, suggestions: [] };
  const byCode = header.customer.code
    ? await customersRepo.findCustomerByExternalCode(db, tenantId, header.customer.code)
    : null;
  if (byCode) return { customerId: byCode.id, suggestions: [] };
  const found = header.customer.name
    ? await customersRepo.suggestCustomersByName(db, tenantId, header.customer.name)
    : [];
  return {
    customerId: null,
    suggestions: found.map((f) => ({
      id: f.customer.id,
      label: `${f.customer.tradeName ?? f.customer.legalName} (${f.customer.externalCode})`,
      score: Math.round(Number(f.score) * 100) / 100,
    })),
  };
}

type Computed = {
  header: { data: OrderHeaderData; warnings: RowWarning[] };
  lines: {
    data: OrderLineData;
    warnings: RowWarning[];
    matchId: string | null;
    matchType: string;
  }[];
};

/** Recalcula avisos e vínculos de produto a partir dos dados correntes (linhas rejeitadas não contam). */
async function compute(
  db: Db,
  tenantId: string,
  header: OrderHeaderData,
  lines: { data: OrderLineData; rejected: boolean }[],
): Promise<Computed> {
  const codes = lines
    .map((l) => l.data.code)
    .filter((c): c is string => !!c && !parseProductCode(c).ambiguous);
  const ids = await productsRepo.findProductIdsByCodes(db, tenantId, codes);
  const active = lines.filter((l) => !l.rejected).map((l) => l.data);
  const hw = validateOrderHeader(header, active);
  if (!header.customerId)
    hw.push(
      block("cliente_nao_vinculado", "Cliente não identificado; escolha o cliente do pedido"),
    );
  if (header.orderNumber && (await ordersRepo.orderNumberExists(db, tenantId, header.orderNumber)))
    hw.push(block("pedido_duplicado", `O pedido ${header.orderNumber} já foi importado`));
  return {
    header: { data: header, warnings: hw },
    lines: lines.map((l) => {
      const matchId = l.data.code ? (ids.get(l.data.code) ?? null) : null;
      return {
        data: l.data,
        warnings: l.rejected ? [] : validateOrderLine(l.data),
        matchId,
        matchType: matchId ? "code" : l.data.code ? "new" : "none",
      };
    }),
  };
}

const hasBlocking = (w: RowWarning[]) => w.some((x) => x.severity === "blocking");

function toRows(c: Computed, rejected: boolean[] = []): importsRepo.NewImportRow[] {
  return [
    {
      rowIndex: 0,
      rowType: "order_header",
      data: c.header.data,
      warnings: c.header.warnings,
      matchType: c.header.data.customerId ? "code" : "none",
      matchId: c.header.data.customerId,
      status: hasBlocking(c.header.warnings) ? "pending" : "accepted",
    },
    ...c.lines.map((l, i): importsRepo.NewImportRow => ({
      rowIndex: i + 1,
      rowType: "order_line",
      data: l.data,
      warnings: l.warnings,
      confidence: l.data.confidence === null ? null : String(l.data.confidence),
      matchType: l.matchType,
      matchId: l.matchId,
      status: rejected[i] ? "rejected" : hasBlocking(l.warnings) ? "pending" : "accepted",
    })),
  ];
}

/** Grava as linhas de revisão de um pedido a partir de dados já normalizados. */
export async function buildOrderRows(
  db: Db,
  tenantId: string,
  jobId: string,
  input: {
    header: HeaderInput;
    lines: OrderLineData[];
    presetCustomerId?: string | null;
    rawOutput?: unknown;
  },
) {
  const match = input.presetCustomerId
    ? { customerId: input.presetCustomerId, suggestions: [] }
    : await matchCustomer(db, tenantId, input.header);
  const header: OrderHeaderData = { ...input.header, ...match };
  const c = await compute(
    db,
    tenantId,
    header,
    input.lines.map((data) => ({ data, rejected: false })),
  );
  await importsRepo.replaceImportRows(db, tenantId, jobId, toRows(c));
  await importsRepo.updateImportJob(db, tenantId, jobId, {
    status: "review",
    error: null,
    ...(input.rawOutput === undefined ? {} : { rawOutput: input.rawOutput }),
  });
  return c;
}

/** Extrator registrado para import_jobs do tipo `order` (PDF ou imagem). */
export async function extractOrder(
  ctx: ExtractContext,
  client?: Parameters<typeof extractStructured>[1],
) {
  const { db, tenantId, jobId } = ctx;
  const job = await importsRepo.getImportJob(db, tenantId, jobId);
  if (!job) throw new Error("Importação não encontrada");
  const doc = await documentsRepo.getDocumentById(db, tenantId, job.documentId);
  const file = doc && (await readDocument(db, tenantId, doc.sha256));
  if (!doc || !file) throw new AiPermanentError("Arquivo original não encontrado");
  const attachment: AiAttachment =
    doc.mime === "application/pdf"
      ? { kind: "pdf", data: file.data }
      : doc.mime.startsWith("image/")
        ? { kind: "image", data: file.data }
        : (() => {
            throw new AiPermanentError("Envie o pedido em PDF ou imagem");
          })();
  const result = await extractStructured(
    {
      system: loadPrompt("order.md"),
      prompt: "Extraia os dados deste pedido.",
      attachments: [attachment],
      schema: OrderExtractionSchema,
    },
    client,
  );
  await importsRepo.updateImportJob(db, tenantId, jobId, {
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costCentsEstimate: String(result.costCentsEstimate),
  });
  const processed = postProcessOrder(result.data);
  await buildOrderRows(db, tenantId, jobId, {
    ...processed,
    rawOutput: { extraction: result.data },
  });
}

export async function createOrderUpload(
  db: Db,
  tenantId: string,
  input: { buffer: Buffer; filename: string; userId?: string },
) {
  const { document } = await saveDocument(db, tenantId, { ...input, kind: "order" });
  const job = await importsRepo.createImportJob(db, tenantId, {
    documentId: document.id,
    kind: "order" satisfies JobKind,
    status: "queued",
    createdBy: input.userId ?? null,
  });
  return job.id;
}

async function loadRows(db: Db, tenantId: string, jobId: string) {
  const rows = await importsRepo.listImportRows(db, tenantId, jobId);
  const header = rows.find((r) => r.rowType === "order_header");
  if (!header) throw new Error("Pedido sem cabeçalho");
  return { header, lines: rows.filter((r) => r.rowType === "order_line") };
}

/** Recalcula avisos, vínculos e situação de todas as linhas depois de uma edição. */
export async function revalidateOrderJob(db: Db, tenantId: string, jobId: string) {
  const { header, lines } = await loadRows(db, tenantId, jobId);
  const c = await compute(
    db,
    tenantId,
    header.data as OrderHeaderData,
    lines.map((l) => ({ data: l.data as OrderLineData, rejected: l.status === "rejected" })),
  );
  const next = (prev: string, warnings: RowWarning[]) =>
    prev === "rejected"
      ? "rejected"
      : hasBlocking(warnings)
        ? "pending"
        : prev === "pending"
          ? "edited"
          : prev;
  await importsRepo.updateImportRow(db, tenantId, header.id, {
    data: c.header.data,
    warnings: c.header.warnings,
    matchType: c.header.data.customerId ? "code" : "none",
    matchId: c.header.data.customerId,
    status: next(header.status, c.header.warnings) as "pending",
  });
  for (const [i, l] of lines.entries()) {
    const computed = c.lines[i]!;
    await importsRepo.updateImportRow(db, tenantId, l.id, {
      data: computed.data,
      warnings: computed.warnings,
      matchType: computed.matchType,
      matchId: computed.matchId,
      status: next(l.status, computed.warnings) as "pending",
    });
  }
}

async function assertReviewable(db: Db, tenantId: string, jobId: string) {
  const job = await importsRepo.getImportJob(db, tenantId, jobId);
  if (!job || job.kind !== "order") throw new Error("Importação não encontrada");
  if (job.status !== "review") throw new Error("A importação não está em revisão");
  return job;
}

export async function setOrderCustomer(
  db: Db,
  tenantId: string,
  jobId: string,
  input: { customerId?: string; code?: string },
) {
  await assertReviewable(db, tenantId, jobId);
  const customer = input.customerId
    ? await customersRepo.getCustomerById(db, tenantId, input.customerId)
    : await customersRepo.findCustomerByExternalCode(db, tenantId, (input.code ?? "").trim());
  if (!customer) throw new Error("Cliente não encontrado");
  const { header } = await loadRows(db, tenantId, jobId);
  const data = { ...(header.data as OrderHeaderData), customerId: customer.id };
  await importsRepo.updateImportRow(db, tenantId, header.id, { data });
  await revalidateOrderJob(db, tenantId, jobId);
}

export async function editOrderHeader(
  db: Db,
  tenantId: string,
  jobId: string,
  patch: { orderNumber?: string; issuedAt?: string },
) {
  await assertReviewable(db, tenantId, jobId);
  const { header } = await loadRows(db, tenantId, jobId);
  const cur = header.data as OrderHeaderData;
  const data: OrderHeaderData = {
    ...cur,
    orderNumber: patch.orderNumber?.trim() ?? cur.orderNumber,
    issuedAt:
      patch.issuedAt === undefined
        ? cur.issuedAt
        : /^\d{4}-\d{2}-\d{2}$/.test(patch.issuedAt)
          ? patch.issuedAt
          : null,
  };
  await importsRepo.updateImportRow(db, tenantId, header.id, { data });
  await revalidateOrderJob(db, tenantId, jobId);
}

export async function editOrderLine(
  db: Db,
  tenantId: string,
  rowId: string,
  patch: { code?: string; description?: string; qty?: number; unitPriceCents?: number },
) {
  const row = await importsRepo.getImportRow(db, tenantId, rowId);
  if (!row || row.rowType !== "order_line") throw new Error("Linha não encontrada");
  await assertReviewable(db, tenantId, row.importJobId);
  const cur = row.data as OrderLineData;
  const parsed = patch.code === undefined ? null : parseProductCode(patch.code);
  const data: OrderLineData = {
    ...cur,
    ...(patch.code === undefined
      ? {}
      : {
          rawCode: patch.code.trim(),
          // código ambíguo nunca casa sozinho: só vale se o usuário o digitou completo
          code: parsed?.code && !parsed.ambiguous ? parsed.code : null,
        }),
    description: patch.description?.trim() ?? cur.description,
    qty: patch.qty ?? cur.qty,
    unitPriceCents: patch.unitPriceCents ?? cur.unitPriceCents,
    // linha editada à mão deixa de depender da leitura da IA
    lineTotalCents:
      patch.qty !== undefined || patch.unitPriceCents !== undefined ? null : cur.lineTotalCents,
    confidence: cur.confidence,
  };
  await importsRepo.updateImportRow(db, tenantId, rowId, { data });
  await revalidateOrderJob(db, tenantId, row.importJobId);
}

export async function setOrderRowStatus(
  db: Db,
  tenantId: string,
  rowId: string,
  status: "accepted" | "rejected",
) {
  const row = await importsRepo.getImportRow(db, tenantId, rowId);
  if (!row || row.rowType !== "order_line") throw new Error("Linha não encontrada");
  await assertReviewable(db, tenantId, row.importJobId);
  if (status === "accepted" && hasBlocking(row.warnings as RowWarning[]))
    throw new Error("Resolva a pendência antes de aceitar a linha");
  await importsRepo.updateImportRow(db, tenantId, rowId, { status });
  await revalidateOrderJob(db, tenantId, row.importJobId);
}

export async function confirmOrderImport(db: Db, tenantId: string, jobId: string, userId?: string) {
  await assertReviewable(db, tenantId, jobId);
  const counts = await importsRepo.countImportRowsByStatus(db, tenantId, jobId);
  if ((counts.pending ?? 0) > 0) throw new Error("Há linhas pendentes de revisão");
  const { header, lines } = await loadRows(db, tenantId, jobId);
  const h = header.data as OrderHeaderData;
  if (!h.customerId || !h.issuedAt) throw new Error("Cliente e data do pedido são obrigatórios");
  const kept = lines.filter((l) => l.status !== "rejected");
  if (kept.length === 0) throw new Error("O pedido não tem nenhuma linha aceita");
  if (await ordersRepo.orderNumberExists(db, tenantId, h.orderNumber))
    throw new Error(`O pedido ${h.orderNumber} já foi importado`);

  await importsRepo.updateImportJob(db, tenantId, jobId, { status: "committing" });
  try {
    const order = await db.transaction(async (tx) => {
      const t = tx as unknown as Db;
      const fresh = kept.filter((l) => !l.matchId).map((l) => l.data as OrderLineData);
      const seen = new Set<string>();
      await productsRepo.insertNewProducts(
        t,
        tenantId,
        fresh
          .filter((d) => d.code && !seen.has(d.code) && seen.add(d.code))
          .map((d) => {
            const pack = parsePack(d.description);
            return {
              code: d.code!,
              description: d.description,
              brand: null,
              packText: null,
              packQty: pack ? String(pack.qty) : null,
              packUnitSize: pack?.unitSize ? String(pack.unitSize) : null,
              packUnit: pack?.unit ?? null,
              saleUnit: normalizeSaleUnit(d.unit),
              listPriceCents: null,
              source: "order",
              searchText: buildProductSearchText({
                code: d.code!,
                description: d.description,
                brand: null,
              }),
            };
          }),
      );
      const ids = await productsRepo.findProductIdsByCodes(
        t,
        tenantId,
        kept.map((l) => (l.data as OrderLineData).code!).filter(Boolean),
      );
      const created = await ordersRepo.createOrderWithLines(
        t,
        tenantId,
        {
          externalNumber: h.orderNumber,
          customerId: h.customerId!,
          repCode: h.repCode,
          issuedAt: isoToIssuedAt(h.issuedAt!),
          paymentTerms: h.paymentTerms,
          totalCents: h.totalCents,
          sourceDocumentId: (await importsRepo.getImportJob(t, tenantId, jobId))!.documentId,
          status: "confirmed",
        },
        kept.map((l) => {
          const d = l.data as OrderLineData;
          return {
            productId: ids.get(d.code!) ?? null,
            rawCode: d.rawCode,
            rawDescription: d.description,
            unit: d.unit,
            qty: String(d.qty),
            unitPriceCents: d.unitPriceCents,
            totalCents: d.lineTotalCents ?? Math.round(d.qty * d.unitPriceCents),
          };
        }),
      );
      await auditRepo.writeAudit(t, tenantId, {
        userId,
        action: "import.confirm",
        entity: "import_job",
        entityId: jobId,
        diff: { kind: "order", orderId: created.id, lines: kept.length },
      });
      return created;
    });
    await importsRepo.updateImportJob(db, tenantId, jobId, {
      status: "done",
      confirmedBy: userId ?? null,
      confirmedAt: new Date(),
    });
    return { orderId: order.id };
  } catch (e) {
    await importsRepo.updateImportJob(db, tenantId, jobId, {
      status: "review",
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

export type TypedOrderInput = {
  customerId: string;
  orderNumber?: string;
  /** AAAA-MM-DD */
  issuedAt: string;
  paymentTerms?: string | null;
  lines: { code: string; qty: number; unitPriceCents: number; description?: string }[];
  userId?: string;
};

/**
 * "Digitar pedido": passa pelo mesmo pipeline de revisão, sem IA. Se não houver pendência,
 * confirma na hora e devolve `orderId`; senão devolve o `jobId` para revisão.
 */
export async function createTypedOrder(
  db: Db,
  tenantId: string,
  input: TypedOrderInput,
  now: Date = new Date(),
) {
  const customer = await customersRepo.getCustomerById(db, tenantId, input.customerId);
  if (!customer) throw new Error("Cliente não encontrado");
  const stamp = now.toISOString().replace(/\D/g, "").slice(0, 14);
  const orderNumber = input.orderNumber?.trim() || `D-${stamp}`;
  const known = await productsRepo.findProductIdsByCodes(
    db,
    tenantId,
    input.lines.map((l) => parseProductCode(l.code).code ?? "").filter(Boolean),
  );
  const descriptions = new Map<string, string>();
  for (const [code, id] of known) {
    const p = await productsRepo.getProductById(db, tenantId, id);
    if (p) descriptions.set(code, p.description);
  }
  const lines: OrderLineData[] = input.lines.map((l) => {
    const parsed = parseProductCode(l.code);
    return {
      code: parsed.ambiguous ? null : parsed.code,
      rawCode: l.code.trim(),
      description:
        l.description?.trim() || (parsed.code ? (descriptions.get(parsed.code) ?? "") : ""),
      unit: null,
      qty: l.qty,
      unitPriceCents: l.unitPriceCents,
      lineTotalCents: null,
      confidence: null,
    };
  });
  const header: HeaderInput = {
    orderNumber,
    issuedAt: input.issuedAt,
    customer: {
      code: customer.externalCode,
      document: customer.document,
      name: customer.tradeName ?? customer.legalName,
    },
    repCode: null,
    paymentTerms: input.paymentTerms ?? null,
    totalCents: null,
  };
  const { document } = await saveDocument(db, tenantId, {
    buffer: Buffer.from(JSON.stringify({ header, lines, at: now.toISOString() })),
    filename: `pedido-digitado-${stamp}.json`,
    kind: "order",
    userId: input.userId,
    mime: "application/json",
  });
  const job = await importsRepo.createImportJob(db, tenantId, {
    documentId: document.id,
    kind: "order",
    status: "extracting",
    createdBy: input.userId ?? null,
  });
  const c = await buildOrderRows(db, tenantId, job.id, {
    header,
    lines,
    presetCustomerId: customer.id,
    rawOutput: { typed: true },
  });
  const pending = [c.header.warnings, ...c.lines.map((l) => l.warnings)].some(hasBlocking);
  if (pending) return { jobId: job.id, orderId: null };
  const { orderId } = await confirmOrderImport(db, tenantId, job.id, input.userId);
  return { jobId: job.id, orderId };
}
