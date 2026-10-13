import type { Db } from "../db/client";
import { AiPermanentError, extractStructured, type AiAttachment } from "../importers/ai/client";
import { loadPrompt } from "../importers/ai/rank-products";
import { PromotionExtractionSchema } from "../importers/ai/schemas";
import {
  postProcessPromotion,
  validatePromotionHeader,
  validatePromotionItem,
  type PromoUnit,
  type PromotionHeaderData,
  type PromotionItemData,
} from "../importers/promotion/postprocess";
import { buildProductSearchText } from "../importers/spreadsheet/products";
import type { RowWarning } from "../importers/types";
import { warn } from "../importers/types";
import type { ExtractContext } from "../jobs/extractors";
import { parsePack, parseProductCode, todayIso } from "../normalize";
import {
  auditRepo,
  documentsRepo,
  importsRepo,
  productsRepo,
  promotionsRepo,
  settingsRepo,
} from "../repos";
import { readDocument, saveDocument } from "../storage/documents";

export type { PromotionHeaderData, PromotionItemData };

type Computed = {
  header: { data: PromotionHeaderData; warnings: RowWarning[] };
  items: {
    data: PromotionItemData;
    warnings: RowWarning[];
    matchId: string | null;
    matchType: "code" | "description" | "new" | "none";
  }[];
};

const hasBlocking = (w: RowWarning[]) => w.some((x) => x.severity === "blocking");

async function compute(
  db: Db,
  tenantId: string,
  header: PromotionHeaderData,
  items: { data: PromotionItemData; rejected: boolean }[],
  documentId: string | null,
): Promise<Computed> {
  const codes = items.map((i) => i.data.code).filter((c): c is string => !!c);
  const ids = await productsRepo.findProductIdsByCodes(db, tenantId, codes);
  const hw = validatePromotionHeader(header);
  if (documentId && (await promotionsRepo.findPromotionByDocument(db, tenantId, documentId)))
    hw.push(warn("encarte_repetido", "Este mesmo arquivo já foi importado como encarte antes"));
  return {
    header: { data: header, warnings: hw },
    items: items.map((i) => {
      const d = i.data;
      const byCode = d.code ? (ids.get(d.code) ?? null) : null;
      const matchId = d.linkedProductId ?? byCode;
      return {
        data: d,
        warnings: i.rejected ? [] : validatePromotionItem(d),
        matchId,
        matchType: d.linkedProductId ? "description" : byCode ? "code" : d.code ? "new" : "none",
      };
    }),
  };
}

function toRows(c: Computed): importsRepo.NewImportRow[] {
  return [
    {
      rowIndex: 0,
      rowType: "promotion_header",
      data: c.header.data,
      warnings: c.header.warnings,
      status: hasBlocking(c.header.warnings) ? "pending" : "accepted",
    },
    ...c.items.map((i, n): importsRepo.NewImportRow => ({
      rowIndex: n + 1,
      rowType: "promotion_item",
      data: i.data,
      warnings: i.warnings,
      confidence: i.data.confidence === null ? null : String(i.data.confidence),
      matchType: i.matchType,
      matchId: i.matchId,
      status: hasBlocking(i.warnings) ? "pending" : "accepted",
    })),
  ];
}

export async function buildPromotionRows(
  db: Db,
  tenantId: string,
  jobId: string,
  input: { header: PromotionHeaderData; items: PromotionItemData[]; rawOutput?: unknown },
) {
  const job = await importsRepo.getImportJob(db, tenantId, jobId);
  const c = await compute(
    db,
    tenantId,
    input.header,
    input.items.map((data) => ({ data, rejected: false })),
    job?.documentId ?? null,
  );
  await importsRepo.replaceImportRows(db, tenantId, jobId, toRows(c));
  await importsRepo.updateImportJob(db, tenantId, jobId, {
    status: "review",
    error: null,
    ...(input.rawOutput === undefined ? {} : { rawOutput: input.rawOutput }),
  });
  return c;
}

/** Extrator registrado para import_jobs do tipo `promotion` (imagem ou PDF de encarte). */
export async function extractPromotion(
  ctx: ExtractContext,
  client?: Parameters<typeof extractStructured>[1],
  now: Date = new Date(),
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
            throw new AiPermanentError("Envie o encarte em imagem ou PDF");
          })();
  const result = await extractStructured(
    {
      system: loadPrompt("promotion.md"),
      prompt: "Extraia os itens deste encarte de ofertas.",
      attachments: [attachment],
      schema: PromotionExtractionSchema,
    },
    client,
  );
  await importsRepo.updateImportJob(db, tenantId, jobId, {
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costCentsEstimate: String(result.costCentsEstimate),
  });
  const settings = await settingsRepo.getEngineSettings(db, tenantId);
  const processed = postProcessPromotion(result.data, {
    now,
    defaultDays: settings.promotionDefaultDays,
  });
  await buildPromotionRows(db, tenantId, jobId, {
    ...processed,
    rawOutput: { extraction: result.data },
  });
}

export async function createPromotionUpload(
  db: Db,
  tenantId: string,
  input: { buffer: Buffer; filename: string; userId?: string },
) {
  const { document } = await saveDocument(db, tenantId, { ...input, kind: "promotion" });
  const job = await importsRepo.createImportJob(db, tenantId, {
    documentId: document.id,
    kind: "promotion",
    status: "queued",
    createdBy: input.userId ?? null,
  });
  return job.id;
}

async function loadRows(db: Db, tenantId: string, jobId: string) {
  const rows = await importsRepo.listImportRows(db, tenantId, jobId);
  const header = rows.find((r) => r.rowType === "promotion_header");
  if (!header) throw new Error("Encarte sem cabeçalho");
  return { header, items: rows.filter((r) => r.rowType === "promotion_item") };
}

export async function revalidatePromotionJob(db: Db, tenantId: string, jobId: string) {
  const job = await importsRepo.getImportJob(db, tenantId, jobId);
  const { header, items } = await loadRows(db, tenantId, jobId);
  const c = await compute(
    db,
    tenantId,
    header.data as PromotionHeaderData,
    items.map((r) => ({ data: r.data as PromotionItemData, rejected: r.status === "rejected" })),
    job?.documentId ?? null,
  );
  type Status = importsRepo.ImportRow["status"];
  const next = (prev: Status, w: RowWarning[]): Status =>
    prev === "rejected"
      ? "rejected"
      : hasBlocking(w)
        ? "pending"
        : prev === "pending"
          ? "edited"
          : prev;
  await importsRepo.updateImportRow(db, tenantId, header.id, {
    data: c.header.data,
    warnings: c.header.warnings,
    status: next(header.status as Status, c.header.warnings),
  });
  for (const [n, r] of items.entries()) {
    const i = c.items[n]!;
    await importsRepo.updateImportRow(db, tenantId, r.id, {
      data: i.data,
      warnings: i.warnings,
      matchType: i.matchType,
      matchId: i.matchId,
      status: next(r.status as Status, i.warnings),
    });
  }
}

async function assertReviewable(db: Db, tenantId: string, jobId: string) {
  const job = await importsRepo.getImportJob(db, tenantId, jobId);
  if (!job || job.kind !== "promotion") throw new Error("Importação não encontrada");
  if (job.status !== "review") throw new Error("A importação não está em revisão");
  return job;
}

const isIso = (s: string | undefined) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function editPromotionHeader(
  db: Db,
  tenantId: string,
  jobId: string,
  patch: { name?: string; startsOn?: string; endsOn?: string },
) {
  await assertReviewable(db, tenantId, jobId);
  const { header } = await loadRows(db, tenantId, jobId);
  const cur = header.data as PromotionHeaderData;
  const datesTouched = patch.startsOn !== undefined || patch.endsOn !== undefined;
  const data: PromotionHeaderData = {
    ...cur,
    name: patch.name?.trim() ?? cur.name,
    startsOn:
      patch.startsOn === undefined ? cur.startsOn : isIso(patch.startsOn) ? patch.startsOn! : null,
    endsOn: patch.endsOn === undefined ? cur.endsOn : isIso(patch.endsOn) ? patch.endsOn! : null,
    // datas confirmadas à mão deixam de ser "padrão sugerido"
    usedDefaultDates: datesTouched ? false : cur.usedDefaultDates,
  };
  await importsRepo.updateImportRow(db, tenantId, header.id, { data });
  await revalidatePromotionJob(db, tenantId, jobId);
}

export async function editPromotionItem(
  db: Db,
  tenantId: string,
  rowId: string,
  patch: {
    code?: string;
    description?: string;
    priceCents?: number;
    priceUnit?: PromoUnit | "";
    packText?: string;
  },
) {
  const row = await importsRepo.getImportRow(db, tenantId, rowId);
  if (!row || row.rowType !== "promotion_item") throw new Error("Item não encontrado");
  await assertReviewable(db, tenantId, row.importJobId);
  const cur = row.data as PromotionItemData;
  const parsed = patch.code === undefined ? null : parseProductCode(patch.code);
  const data: PromotionItemData = {
    ...cur,
    ...(patch.code === undefined
      ? {}
      : {
          rawCode: patch.code.trim() || null,
          ambiguous: !!parsed?.ambiguous,
          code: parsed?.code && !parsed.ambiguous ? parsed.code : null,
          // digitar um código novo desfaz o vínculo feito por busca
          linkedProductId: patch.code.trim() ? null : cur.linkedProductId,
        }),
    description: patch.description?.trim() ?? cur.description,
    priceCents: patch.priceCents ?? cur.priceCents,
    priceUnit: patch.priceUnit === undefined ? cur.priceUnit : patch.priceUnit || null,
    packText: patch.packText === undefined ? cur.packText : patch.packText.trim() || null,
  };
  await importsRepo.updateImportRow(db, tenantId, rowId, { data });
  await revalidatePromotionJob(db, tenantId, row.importJobId);
}

export async function linkPromotionItem(
  db: Db,
  tenantId: string,
  rowId: string,
  productId: string,
) {
  const row = await importsRepo.getImportRow(db, tenantId, rowId);
  if (!row || row.rowType !== "promotion_item") throw new Error("Item não encontrado");
  await assertReviewable(db, tenantId, row.importJobId);
  const product = await productsRepo.getProductById(db, tenantId, productId);
  if (!product) throw new Error("Produto não encontrado");
  const data: PromotionItemData = {
    ...(row.data as PromotionItemData),
    linkedProductId: product.id,
  };
  await importsRepo.updateImportRow(db, tenantId, rowId, { data });
  await revalidatePromotionJob(db, tenantId, row.importJobId);
}

export async function setPromotionRowStatus(
  db: Db,
  tenantId: string,
  rowId: string,
  status: "accepted" | "rejected",
) {
  const row = await importsRepo.getImportRow(db, tenantId, rowId);
  if (!row || row.rowType !== "promotion_item") throw new Error("Item não encontrado");
  await assertReviewable(db, tenantId, row.importJobId);
  if (status === "accepted" && hasBlocking(row.warnings as RowWarning[]))
    throw new Error("Resolva a pendência antes de aceitar o item");
  await importsRepo.updateImportRow(db, tenantId, rowId, { status });
  await revalidatePromotionJob(db, tenantId, row.importJobId);
}

export async function confirmPromotionImport(
  db: Db,
  tenantId: string,
  jobId: string,
  userId?: string,
  now: Date = new Date(),
) {
  const job = await assertReviewable(db, tenantId, jobId);
  const counts = await importsRepo.countImportRowsByStatus(db, tenantId, jobId);
  if ((counts.pending ?? 0) > 0) throw new Error("Há itens pendentes de revisão");
  const { header, items } = await loadRows(db, tenantId, jobId);
  const h = header.data as PromotionHeaderData;
  if (!h.startsOn || !h.endsOn) throw new Error("Informe a vigência da oferta");
  const kept = items.filter((r) => r.status !== "rejected");
  if (kept.length === 0) throw new Error("O encarte não tem nenhum item aceito");

  await importsRepo.updateImportJob(db, tenantId, jobId, { status: "committing" });
  try {
    const promotion = await db.transaction(async (tx) => {
      const t = tx as unknown as Db;
      const seen = new Set<string>();
      await productsRepo.insertNewProducts(
        t,
        tenantId,
        kept
          .filter((r) => !r.matchId)
          .map((r) => r.data as PromotionItemData)
          .filter((d) => d.code && !seen.has(d.code) && seen.add(d.code))
          .map((d) => {
            const pack = parsePack(d.packText) ?? parsePack(d.description);
            return {
              code: d.code!,
              description: d.description,
              brand: d.brand,
              packText: d.packText,
              packQty: pack ? String(pack.qty) : null,
              packUnitSize: pack?.unitSize ? String(pack.unitSize) : null,
              packUnit: pack?.unit ?? null,
              saleUnit: d.priceUnit,
              listPriceCents: null,
              source: "promotion",
              searchText: buildProductSearchText({
                code: d.code!,
                description: d.description,
                brand: d.brand,
              }),
            };
          }),
      );
      const ids = await productsRepo.findProductIdsByCodes(
        t,
        tenantId,
        kept.map((r) => (r.data as PromotionItemData).code).filter((c): c is string => !!c),
      );
      const created = await promotionsRepo.createPromotionWithItems(
        t,
        tenantId,
        {
          name: h.name,
          supplierBrand: h.supplierBrand,
          startsOn: h.startsOn!,
          endsOn: h.endsOn!,
          conditionsText: null,
          targetSegmentsHint: h.targetSegmentsHint,
          documentId: job.documentId,
          status: h.endsOn! < todayIso(now) ? "expired" : "active",
        },
        kept.map((r) => {
          const d = r.data as PromotionItemData;
          return {
            productId: d.linkedProductId ?? (d.code ? (ids.get(d.code) ?? null) : null),
            rawCode: d.rawCode,
            rawDescription: d.description,
            packText: d.packText,
            priceCents: d.priceCents,
            priceUnit: d.priceUnit!,
            boxPriceCents: d.boxPriceCents,
            regularPriceCents: d.regularPriceCents,
            priceType: d.priceType,
            minQty: d.minQty === null ? null : String(d.minQty),
            conditionText: d.conditionText,
          };
        }),
      );
      await auditRepo.writeAudit(t, tenantId, {
        userId,
        action: "import.confirm",
        entity: "import_job",
        entityId: jobId,
        diff: { kind: "promotion", promotionId: created.id, items: kept.length },
      });
      return created;
    });
    await importsRepo.updateImportJob(db, tenantId, jobId, {
      status: "done",
      confirmedBy: userId ?? null,
      confirmedAt: new Date(),
    });
    return { promotionId: promotion.id, items: kept.length };
  } catch (e) {
    await importsRepo.updateImportJob(db, tenantId, jobId, {
      status: "review",
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
